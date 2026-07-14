/**
 * 夜間バッチ：顧客ごとの対応サマリーを事前生成する（COST_DESIGN §2⑤）。
 * 「聞かれる前に要約しておく」ことで、日中の質問が軽いサマリーにヒットし、
 * 精読トークンと回答速度の両方を改善する。
 *
 * 本番の完全形（TODO）：
 *  - 顧客ごとにメール(顧客ドメイン抽出)・議事録の直近コンテキストを収集（ACCESS_CONTROL §4）
 *  - Claude Batch API（全モデル50%オフ・24時間以内）で一括要約
 *  - 生成物を Supabase(customer_summaries) に保存（該当部門L2スコープで参照）
 * 現状はスケルトン：収集/要約はスタブ、保存はSupabase or ログ。
 */
import { config } from "../config.js";

export interface CustomerRef {
  customerId: string;
  name: string;
}

export interface CustomerSummary {
  customerId: string;
  name: string;
  summary: string;
  generatedAt: string;
}

/** 対象顧客の取得（本番はSupabaseの顧客テーブル/顧客DBから） */
async function loadCustomers(): Promise<CustomerRef[]> {
  if (config.mockMode) {
    return [
      { customerId: "c1", name: "シコメル" },
      { customerId: "c2", name: "サンプル商事" },
    ];
  }
  // TODO: Supabase の顧客テーブルから取得
  return [];
}

/** 顧客の直近対応を要約（本番はコンテキスト収集＋Claude Batch API） */
async function summarizeCustomer(c: CustomerRef): Promise<string> {
  if (config.mockMode) {
    return `【モック】${c.name} の直近対応サマリー（メール・議事録の要約がここに入る）`;
  }
  // TODO(COST_DESIGN §2⑤): コンテキスト収集 → Claude Batch API で要約生成
  return `（未実装）${c.name} のサマリー`;
}

/** サマリーを保存（本番はSupabase、開発はログ） */
async function saveSummary(s: CustomerSummary): Promise<void> {
  if (config.mockMode || !config.supabase.url) {
    console.log(JSON.stringify({ type: "customer_summary", ...s }));
    return;
  }
  const { createClient } = await import("@supabase/supabase-js");
  const db = createClient(config.supabase.url, config.supabase.serviceRoleKey ?? "", {
    auth: { persistSession: false },
  });
  const { error } = await db.from(config.jobs.summaryTable).upsert({
    customer_id: s.customerId,
    name: s.name,
    summary: s.summary,
    generated_at: s.generatedAt,
  });
  if (error) throw error;
}

export async function runNightlySummary(): Promise<{ generated: number }> {
  const customers = await loadCustomers();
  const generatedAt = new Date().toISOString();
  let generated = 0;
  for (const c of customers) {
    const summary = await summarizeCustomer(c);
    await saveSummary({ customerId: c.customerId, name: c.name, summary, generatedAt });
    generated++;
  }
  console.log(JSON.stringify({ type: "nightly_summary_done", generated, generatedAt }));
  return { generated };
}
