/**
 * スモークテスト（MOCK_MODE でエージェント〜ハンドラの一気通貫を確認）。
 * 実行: MOCK_MODE=true npm run smoke
 */
import { handleChatEvent } from "../src/chat/handler.js";
import type { ChatEvent } from "../src/chat/types.js";
import { getTokenStore } from "../src/sources/tokenStore.js";
import { maskQuestion } from "../src/logging/mask.js";

// --- 暗号化トークン保管の往復（SECURITY T1）---
const store = getTokenStore();
await store.set("users/enc", { accessToken: "secret-abc", refreshToken: "refresh-xyz" });
const back = await store.get("users/enc");
if (back?.accessToken !== "secret-abc") {
  console.error("暗号化トークン往復に失敗");
  process.exit(1);
}
const revoked = await store.revokeAll();
if ((await store.get("users/enc")) !== undefined || revoked < 1) {
  console.error("一括失効に失敗");
  process.exit(1);
}
console.log(`✅ 暗号化トークン保管＋一括失効OK（失効 ${revoked} 件）`);

// --- ログ機密度マスク（案B）---
const normal = maskQuestion("シコメル様の契約条件は？");
const sensitive = maskQuestion("田中さんの給与と人事評価は？");
if (normal.masked || !sensitive.masked) {
  console.error("マスク判定に失敗", { normal, sensitive });
  process.exit(1);
}
console.log(`✅ 機密度マスクOK（通常=素通し / 機微=マスク）`);


const event: ChatEvent = {
  type: "MESSAGE",
  message: {
    argumentText: "シコメル様の契約条件は？",
    sender: { name: "users/123", displayName: "石井", email: "gou@dgloss.example", type: "HUMAN" },
    space: { name: "spaces/AAAA", type: "DM" },
    thread: { name: "spaces/AAAA/threads/BBBB" },
  },
  space: { name: "spaces/AAAA", type: "DM" },
};

const res = await handleChatEvent(event);
console.log("=== Chat レスポンス ===");
console.log(res.text);

if (!res.text.includes("MOCK")) {
  console.error("想定と異なる応答（MOCK_MODE で実行してください）");
  process.exit(1);
}
console.log("\n✅ スモークテスト成功");
