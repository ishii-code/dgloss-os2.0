/**
 * Chat イベント → 正規化 → エージェント実行 → Chat レスポンスへの変換。
 * Phase 2 S1 は同期応答（受付即応の非同期化は S4 で Cloud Tasks 化予定）。
 */
import type { ChatEvent, ChatResponse, BrainRequest } from "./types.js";
import { runBrain } from "../brain/agent.js";
import { logQA } from "../logging/qaLog.js";

export async function handleChatEvent(event: ChatEvent): Promise<ChatResponse> {
  switch (event.type) {
    case "ADDED_TO_SPACE":
      return {
        text: "こんにちは。ディグロス・ブレインです。`@ディグロス頭脳 ○○様の契約条件は？` のように聞いてください。回答には必ず出典リンクを付けます。",
      };
    case "REMOVED_FROM_SPACE":
      return { text: "" };
    case "MESSAGE":
      return handleMessage(event);
    default:
      return { text: "対応していないイベントです。" };
  }
}

async function handleMessage(event: ChatEvent): Promise<ChatResponse> {
  const question = (event.message?.argumentText ?? event.message?.text ?? "").trim();
  const sender = event.message?.sender ?? event.user;

  if (!question) {
    return { text: "質問を入力してください。例）`○○様の直近MTGの決定事項は？`" };
  }
  if (!sender?.name) {
    // 匿名の質問は受け付けない（ACCESS_CONTROL §1 原則2）
    return { text: "利用者を識別できませんでした。もう一度お試しください。" };
  }

  const req: BrainRequest = {
    question,
    userId: sender.name,
    userEmail: sender.email,
    spaceName: event.space?.name,
    threadName: event.message?.thread?.name,
  };

  const result = await runBrain(req);
  await logQA(req, result);

  return {
    text: result.answer,
    thread: req.threadName ? { name: req.threadName } : undefined,
  };
}
