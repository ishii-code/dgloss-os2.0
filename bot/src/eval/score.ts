/**
 * ゴールデンセット採点（REQUIREMENTS FR-4.2）。
 * 「期待条件」に対して1回答を決定的に採点する純関数。LLMには依存しない（再現性のため）。
 */
import type { BrainResult } from "../brain/agent.js";

export interface Expect {
  /** 回答すべきか（false=情報が無い/権限外で「見つからない」と断るのが正解） 既定true */
  shouldAnswer?: boolean;
  /** すべて回答本文に含まれるべき語（大小無視） */
  keywordsAll?: string[];
  /** いずれか1つは含まれるべき語 */
  keywordsAny?: string[];
  /** すべて出典URLのどれかに含まれるべき部分文字列 */
  sourceIncludes?: string[];
}

export interface GoldenItem {
  id: string;
  question: string;
  expect: Expect;
  note?: string;
}

export interface ItemScore {
  id: string;
  pass: boolean;
  reasons: string[];
}

export function scoreItem(item: GoldenItem, result: BrainResult): ItemScore {
  const reasons: string[] = [];
  const answered = result.citations.length > 0;
  const shouldAnswer = item.expect.shouldAnswer ?? true;

  if (!shouldAnswer) {
    // 断るのが正解：出典ゼロ（＝断定していない）なら合格
    if (answered) reasons.push("断るべき質問に出典付きで回答した");
    return { id: item.id, pass: reasons.length === 0, reasons };
  }

  if (!answered) reasons.push("出典付きの回答が得られなかった");

  const answerLc = result.answer.toLowerCase();
  for (const kw of item.expect.keywordsAll ?? []) {
    if (!answerLc.includes(kw.toLowerCase())) reasons.push(`必須語が無い: ${kw}`);
  }
  const anyList = item.expect.keywordsAny ?? [];
  if (anyList.length > 0 && !anyList.some((kw) => answerLc.includes(kw.toLowerCase()))) {
    reasons.push(`いずれかの語が必要: ${anyList.join(" / ")}`);
  }
  const citesLc = result.citations.map((c) => c.toLowerCase());
  for (const sub of item.expect.sourceIncludes ?? []) {
    if (!citesLc.some((c) => c.includes(sub.toLowerCase()))) reasons.push(`期待する出典が無い: ${sub}`);
  }

  return { id: item.id, pass: reasons.length === 0, reasons };
}

export interface EvalSummary {
  total: number;
  passed: number;
  passRate: number;
  items: ItemScore[];
}

export function summarize(items: ItemScore[]): EvalSummary {
  const passed = items.filter((i) => i.pass).length;
  const total = items.length;
  return { total, passed, passRate: total ? passed / total : 0, items };
}
