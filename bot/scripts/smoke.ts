/**
 * スモークテスト（MOCK_MODE でエージェント〜ハンドラの一気通貫を確認）。
 * 実行: MOCK_MODE=true npm run smoke
 */
import { handleChatEvent } from "../src/chat/handler.js";
import type { ChatEvent } from "../src/chat/types.js";

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
