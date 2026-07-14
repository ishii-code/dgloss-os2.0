/**
 * 回答処理の共通ロジック。同期パスと非同期(S4)パスの両方から使う。
 *  - processAnswer     : 頭脳実行＋ログ（回答を返す）
 *  - processAndPost    : 上記＋Google Chatへ投稿（非同期ワーカー用）
 */
import { runBrain, type BrainResult } from "./agent.js";
import { logQA } from "../logging/qaLog.js";
import { postToChat } from "../chat/postMessage.js";
import type { BrainRequest } from "../chat/types.js";

export async function processAnswer(req: BrainRequest): Promise<BrainResult> {
  const result = await runBrain(req);
  await logQA(req, result);
  return result;
}

/** 非同期ワーカー：回答を生成し、Chatへ投稿する。例外は握りつぶさずChatにエラー通知して完了させる */
export async function processAndPost(req: BrainRequest): Promise<void> {
  try {
    const result = await processAnswer(req);
    if (req.spaceName) {
      await postToChat(req.spaceName, req.threadName, result.answer, result.citations);
    }
  } catch (e) {
    console.error("[processAndPost]", e);
    if (req.spaceName) {
      await postToChat(
        req.spaceName,
        req.threadName,
        "回答の生成中にエラーが発生しました。時間をおいて再度お試しください。",
      ).catch(() => undefined);
    }
  }
}
