/**
 * Google Chat への追記投稿（S4 非同期回答の出口）。
 * 受付応答を返した後、バックグラウンドで生成した回答をボットのサービスアカウントで投稿する。
 * 回答は cardsV2（本文＋出典リンクボタン）で見やすく投稿する。
 * 参考: https://developers.google.com/workspace/chat/api/reference/rest/v1/spaces.messages/create
 */
import { GoogleAuth } from "google-auth-library";
import { config } from "../config.js";
import { buildAnswerPayload } from "./card.js";

const CHAT_SCOPE = "https://www.googleapis.com/auth/chat.bot";
let auth: GoogleAuth | undefined;

export async function postToChat(
  spaceName: string,
  threadName: string | undefined,
  answer: string,
  citations: string[] = [],
): Promise<void> {
  const payload = buildAnswerPayload(answer, citations);

  if (config.mockMode) {
    // モックでは投稿内容をログに出すだけ（GCP設定前の確認用）
    console.log(JSON.stringify({ type: "chat_post", space: spaceName, thread: threadName, text: payload.text, cards: payload.cardsV2?.length ?? 0 }));
    return;
  }

  auth ??= new GoogleAuth({ scopes: [CHAT_SCOPE] });
  const client = await auth.getClient();

  const base = `https://chat.googleapis.com/v1/${spaceName}/messages`;
  const url = threadName
    ? `${base}?messageReplyOption=REPLY_MESSAGE_FALLBACK_TO_NEW_THREAD`
    : base;
  const data: Record<string, unknown> = { text: payload.text, cardsV2: payload.cardsV2 };
  if (threadName) data.thread = { name: threadName };

  await client.request({ url, method: "POST", data });
}
