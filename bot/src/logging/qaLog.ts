/**
 * QAログ（REQUIREMENTS FR-4.1 / ACCESS_CONTROL §6 監査）。
 * 全質問・回答・参照ページを記録。出典ゼロの回答は「未回答」として別途集計（データ整備の起点）。
 * S5 で Firestore/BigQuery 出力に差し替え。ここでは構造化 JSON をログ出力する。
 */
import type { BrainRequest } from "../chat/types.js";
import type { BrainResult } from "../brain/agent.js";

export interface QALogEntry {
  ts: string;
  userId: string;
  question: string;
  model: string;
  answered: boolean;
  citationCount: number;
  toolCalls: number;
  inputTokens?: number;
  outputTokens?: number;
}

export async function logQA(req: BrainRequest, result: BrainResult): Promise<void> {
  const answered = result.citations.length > 0;
  const entry: QALogEntry = {
    ts: new Date().toISOString(),
    userId: req.userId,
    question: req.question,
    model: result.model,
    answered,
    citationCount: result.citations.length,
    toolCalls: result.toolCalls,
    inputTokens: result.usage?.inputTokens,
    outputTokens: result.usage?.outputTokens,
  };

  // 構造化ログ（Cloud Logging がJSONとして取り込む）
  console.log(JSON.stringify({ type: "qa_log", ...entry }));

  if (!answered) {
    // 未回答＝データ整備の対象。将来はスプレッドシート/Wiki課題に自動起票
    console.log(JSON.stringify({ type: "unanswered", ts: entry.ts, question: req.question }));
  }
}
