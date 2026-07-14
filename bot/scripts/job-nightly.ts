/**
 * 夜間バッチをローカルで手動実行する CLI。
 *   MOCK_MODE=true npm run job:nightly
 */
import { runNightlySummary } from "../src/jobs/nightlySummary.js";

const result = await runNightlySummary();
console.log(`✅ 夜間サマリー生成: ${result.generated}件`);
