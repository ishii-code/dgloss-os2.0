/**
 * 非同期ディスパッチ（S4）。受付応答を返した後の回答生成をどう回すか。
 *  - off    : 同期（受付応答なし・その場で回答）。最小構成/テスト向け
 *  - inline : 応答後に背景で処理。Vercel では waitUntil で関数の実行を延長して回答を投稿する
 *
 * Vercel serverless はレスポンス後に処理が凍結されるため、背景処理は必ず waitUntil に載せる。
 * waitUntil が使えない環境（ローカル等）では fire-and-forget にフォールバックする。
 */
import { config } from "../config.js";
import { processAndPost } from "../brain/process.js";
import type { BrainRequest } from "./types.js";

export async function dispatchAnswer(req: BrainRequest): Promise<void> {
  const job = processAndPost(req);
  const extend = await getWaitUntil();
  if (extend) {
    extend(job); // Vercel: 関数の生存を延長して背景処理を完了させる
  } else {
    void job; // ローカル/常駐サーバ: そのまま背景実行
  }
}

/** @vercel/functions の waitUntil を動的取得（未インストール/非Vercelなら undefined） */
async function getWaitUntil(): Promise<((p: Promise<unknown>) => void) | undefined> {
  try {
    const mod = await import("@vercel/functions");
    return typeof mod.waitUntil === "function" ? mod.waitUntil : undefined;
  } catch {
    return undefined;
  }
}
