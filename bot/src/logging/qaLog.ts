/**
 * QAログ（REQUIREMENTS FR-4.1 / ACCESS_CONTROL §6 監査）。
 * 全質問・回答・参照ページを記録。出典ゼロの回答は「未回答」として別途集計（データ整備の起点）。
 * 質問本文は機密度マスク（SECURITY 判断2＝案B）を通してから記録する。
 * S5 で Firestore/BigQuery 出力に差し替え。ここでは構造化 JSON をログ出力する。
 */
import type { BrainRequest } from "../chat/types.js";
import type { BrainResult } from "../brain/agent.js";
import { maskQuestion } from "./mask.js";

export interface QALogEntry {
  ts: string;
  userId: string;
  question: string; // マスク済み本文（案B）
  masked: boolean;
  model: string;
  answered: boolean;
  citationCount: number;
  toolCalls: number;
  inputTokens?: number;
  outputTokens?: number;
}

export async function logQA(req: BrainRequest, result: BrainResult): Promise<void> {
  const answered = result.citations.length > 0;
  const q = maskQuestion(req.question);
  const entry: QALogEntry = {
    ts: new Date().toISOString(),
    userId: req.userId,
    question: q.text,
    masked: q.masked,
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
    // 未回答＝データ整備の対象。将来はスプレッドシート/Wiki課題に自動起票。本文もマスク済みを使う
    console.log(JSON.stringify({ type: "unanswered", ts: entry.ts, question: q.text, masked: q.masked }));
  }
}
