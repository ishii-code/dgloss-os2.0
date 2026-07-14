/**
 * QAログ（REQUIREMENTS FR-4.1 / ACCESS_CONTROL §6 監査）。
 * 全質問・回答・参照ページを記録。出典ゼロの回答は「未回答」として別途集計（データ整備の起点）。
 * 質問本文は機密度マスク（SECURITY 判断2＝案B）を通してから記録する。
 * S5 で Firestore/BigQuery 出力に差し替え。ここでは構造化 JSON をログ出力する。
 */
import { config } from "../config.js";
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

  // 構造化ログ（Vercel/Cloud Logging がJSONとして取り込む）
  console.log(JSON.stringify({ type: "qa_log", ...entry }));

  if (!answered) {
    // 未回答＝データ整備の対象。将来はスプレッドシート/Wiki課題に自動起票。本文もマスク済みを使う
    console.log(JSON.stringify({ type: "unanswered", ts: entry.ts, question: q.text, masked: q.masked }));
  }

  // 永続化（本番のみ）。失敗しても応答は壊さない（監査は console ログでも担保される）
  await persistToSupabase(entry);
}

async function persistToSupabase(entry: QALogEntry): Promise<void> {
  if (config.mockMode || !config.supabase.url) return;
  try {
    const { createClient } = await import("@supabase/supabase-js");
    const db = createClient(config.supabase.url, config.supabase.serviceRoleKey ?? "", {
      auth: { persistSession: false },
    });
    const { error } = await db.from(config.supabase.qaTable).insert({
      ts: entry.ts,
      user_id: entry.userId,
      question: entry.question,
      masked: entry.masked,
      model: entry.model,
      answered: entry.answered,
      citation_count: entry.citationCount,
      tool_calls: entry.toolCalls,
      input_tokens: entry.inputTokens,
      output_tokens: entry.outputTokens,
    });
    if (error) console.error("[qaLog] Supabase insert失敗", error.message);
  } catch (e) {
    console.error("[qaLog] Supabase insert例外", e);
  }
}
