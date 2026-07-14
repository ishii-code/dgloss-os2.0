/**
 * Google Drive / Docs 検索ツールの実体。質問者本人の OAuth クライアントで実行する。
 * MOCK_MODE ではスタブを返し、GCP設定前でも動作確認できる。
 */
import { google } from "googleapis";
import { config } from "../config.js";
import { getUserAuthClient } from "./googleAuth.js";
import type { SearchResult, SearchHit } from "./types.js";

/** 90日以上更新のない文書は鮮度警告の対象にする（DESIGN 方針B-3の簡易版） */
const STALE_DAYS = 90;

function isStale(iso?: string): boolean {
  if (!iso) return false;
  const ageMs = Date.now() - new Date(iso).getTime();
  return ageMs > STALE_DAYS * 24 * 60 * 60 * 1000;
}

export async function driveSearch(
  userId: string,
  query: string,
  maxResults = 5,
): Promise<SearchResult> {
  const limit = Math.min(Math.max(maxResults, 1), 10);

  if (config.mockMode) {
    const hits: SearchHit[] = [
      {
        title: `【モック】${query} に関する提案資料.gdoc`,
        snippet: `${query} の契約条件・スケジュールに関する記載を含むモック文書です（MOCK_MODE）。`,
        url: "https://docs.google.com/document/d/MOCK_DOC_ID/edit",
        source: "drive",
        lastModified: new Date().toISOString(),
      },
    ];
    return { hits };
  }

  const auth = await getUserAuthClient(userId);
  if (!auth) {
    return { hits: [], unavailableReason: "Google連携が未完了（初回のアカウント連携が必要）" };
  }

  const drive = google.drive({ version: "v3", auth });
  const escaped = query.replace(/'/g, "\\'");
  const res = await drive.files.list({
    q: `fullText contains '${escaped}' and trashed = false`,
    fields: "files(id,name,webViewLink,modifiedTime,mimeType)",
    pageSize: limit,
    orderBy: "modifiedTime desc",
    corpora: "allDrives",
    includeItemsFromAllDrives: true,
    supportsAllDrives: true,
  });

  const hits: SearchHit[] = (res.data.files ?? []).map((f) => ({
    title: f.name ?? "(無題)",
    snippet: `種別: ${f.mimeType ?? "不明"} / 最終更新: ${f.modifiedTime ?? "不明"}`,
    url: f.webViewLink ?? `https://drive.google.com/file/d/${f.id}/view`,
    source: "drive",
    lastModified: f.modifiedTime ?? undefined,
    stale: isStale(f.modifiedTime ?? undefined),
  }));

  return { hits };
}
