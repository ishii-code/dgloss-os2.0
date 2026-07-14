/**
 * Gmail 検索ツールの実体。**本人のトークンでのみ**実行する（他人のメールは技術的に読めない）。
 * ACCESS_CONTROL §4「自分の過去のやり取りを探す＝本人のみ」に対応。
 */
import { google } from "googleapis";
import { config } from "../config.js";
import { getUserAuthClient } from "./googleAuth.js";
import type { SearchResult, SearchHit } from "./types.js";

export async function gmailSearch(
  userId: string,
  query: string,
  maxResults = 5,
): Promise<SearchResult> {
  const limit = Math.min(Math.max(maxResults, 1), 10);

  if (config.mockMode) {
    const hits: SearchHit[] = [
      {
        title: `【モック】Re: ${query}`,
        snippet: "本人のメールスレッドのモック抜粋です（MOCK_MODE）。",
        url: "https://mail.google.com/mail/u/0/#inbox/MOCK_THREAD_ID",
        source: "gmail",
        lastModified: new Date().toISOString(),
      },
    ];
    return { hits };
  }

  const auth = await getUserAuthClient(userId);
  if (!auth) {
    return { hits: [], unavailableReason: "Google連携が未完了（初回のアカウント連携が必要）" };
  }

  const gmail = google.gmail({ version: "v1", auth });
  const list = await gmail.users.messages.list({ userId: "me", q: query, maxResults: limit });
  const messages = list.data.messages ?? [];

  const hits: SearchHit[] = [];
  for (const m of messages) {
    if (!m.id) continue;
    const detail = await gmail.users.messages.get({
      userId: "me",
      id: m.id,
      format: "metadata",
      metadataHeaders: ["Subject", "From", "Date"],
    });
    const headers = detail.data.payload?.headers ?? [];
    const h = (name: string) => headers.find((x) => x.name === name)?.value ?? "";
    hits.push({
      title: h("Subject") || "(件名なし)",
      snippet: `差出人: ${h("From")} / ${h("Date")} — ${detail.data.snippet ?? ""}`,
      url: `https://mail.google.com/mail/u/0/#inbox/${m.id}`,
      source: "gmail",
      lastModified: detail.data.internalDate
        ? new Date(Number(detail.data.internalDate)).toISOString()
        : undefined,
    });
  }

  return { hits };
}
