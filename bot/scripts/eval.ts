/**
 * ゴールデンセット回帰評価 CLI（REQUIREMENTS FR-4.2）。
 *   npm run eval                       # 既定 eval/golden-set.jsonl
 *   EVAL_FILE=path npm run eval
 *   EVAL_THRESHOLD=0.8 EVAL_ENFORCE=1 npm run eval   # 閾値未満で exit 1（CI用）
 *
 * MOCK_MODE では実データ評価はできない（モック回答固定）。まず採点ロジックを自己検証し、
 * 次にゴールデンセットをパイプラインに通して動作確認する。実データ評価は接続後に実施。
 */
import { resolve } from "node:path";
import { scoreItem, type GoldenItem } from "../src/eval/score.js";
import { loadGoldenSet, runGoldenSet } from "../src/eval/runner.js";
import type { BrainResult } from "../src/brain/agent.js";
import { config } from "../src/config.js";

function mkResult(answer: string, citations: string[]): BrainResult {
  return { answer, citations, model: "test", toolCalls: 0 };
}

/** 採点ロジックの決定的自己検証（LLM非依存で常に同結果） */
function selfCheck(): void {
  const cases: Array<[GoldenItem, BrainResult, boolean]> = [
    // 回答すべき＋語＆出典一致 → pass
    [{ id: "s1", question: "q", expect: { keywordsAll: ["経費"], sourceIncludes: ["docs"] } },
      mkResult("経費のルールは…", ["https://docs.google.com/x"]), true],
    // 必須語欠落 → fail
    [{ id: "s2", question: "q", expect: { keywordsAll: ["締め日"] } },
      mkResult("経費のルールは…", ["https://docs/x"]), false],
    // 出典ゼロ → fail
    [{ id: "s3", question: "q", expect: {} }, mkResult("答えます", []), false],
    // 断るべき＋出典ゼロ → pass
    [{ id: "s4", question: "q", expect: { shouldAnswer: false } }, mkResult("見つかりません", []), true],
    // 断るべきなのに回答 → fail
    [{ id: "s5", question: "q", expect: { shouldAnswer: false } }, mkResult("あります", ["https://x"]), false],
  ];
  for (const [item, result, want] of cases) {
    const got = scoreItem(item, result).pass;
    if (got !== want) {
      console.error(`❌ selfCheck失敗 ${item.id}: want=${want} got=${got}`);
      process.exit(1);
    }
  }
  console.log(`✅ 採点ロジック自己検証OK（${cases.length}ケース）`);
}

async function main(): Promise<void> {
  selfCheck();

  const file = resolve(process.env.EVAL_FILE ?? "eval/golden-set.jsonl");
  const items = loadGoldenSet(file);
  console.log(`\nゴールデンセット: ${items.length}問 (${file})`);
  if (config.mockMode) {
    console.log("※ MOCK_MODE：実データ評価は不可。パイプライン疎通と採点の動作確認のみ。\n");
  }

  const summary = await runGoldenSet(items);
  for (const s of summary.items) {
    const mark = s.pass ? "✅" : "❌";
    console.log(`${mark} ${s.id}${s.pass ? "" : "  … " + s.reasons.join(" / ")}`);
  }
  const pct = (summary.passRate * 100).toFixed(0);
  console.log(`\n合格率: ${summary.passed}/${summary.total} (${pct}%)`);

  const threshold = Number(process.env.EVAL_THRESHOLD ?? "0.8");
  const enforce = process.env.EVAL_ENFORCE === "1";
  if (enforce && !config.mockMode && summary.passRate < threshold) {
    console.error(`❌ 閾値 ${(threshold * 100).toFixed(0)}% 未満のため失敗`);
    process.exit(1);
  }
}

await main();
