/**
 * ゴールデンセットの読み込みと実行。各質問を頭脳に通して採点する。
 * 注意：実データ評価では、権限を持つ評価用アカウントのOAuth連携が前提（本人権限で検索するため）。
 */
import { readFileSync } from "node:fs";
import { processAnswer } from "../brain/process.js";
import { scoreItem, summarize, type GoldenItem, type EvalSummary } from "./score.js";

/** JSONL を読む（空行と // 始まりのコメント行はスキップ） */
export function loadGoldenSet(path: string): GoldenItem[] {
  const raw = readFileSync(path, "utf8");
  const items: GoldenItem[] = [];
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("//")) continue;
    items.push(JSON.parse(t) as GoldenItem);
  }
  return items;
}

/** evalユーザー（実データ時は連携済み評価アカウントのuserIdを渡す） */
export async function runGoldenSet(items: GoldenItem[], userId = "eval"): Promise<EvalSummary> {
  const scores = [];
  for (const item of items) {
    const result = await processAnswer({ question: item.question, userId });
    scores.push(scoreItem(item, result));
  }
  return summarize(scores);
}
