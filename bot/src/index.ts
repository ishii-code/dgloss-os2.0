/**
 * Cloud Run エントリポイント。Google Chat の Webフックを受ける HTTP サーバー。
 */
import express from "express";
import type { Request, Response } from "express";
import { config } from "./config.js";
import { verifyChatRequest } from "./chat/verify.js";
import { handleChatEvent } from "./chat/handler.js";
import { buildAuthUrl } from "./sources/googleAuth.js";
import type { ChatEvent } from "./chat/types.js";

const app = express();
app.use(express.json({ limit: "1mb" }));

/** ヘルスチェック */
app.get("/healthz", (_req: Request, res: Response) => {
  res.json({ ok: true, mockMode: config.mockMode });
});

/** Google Chat イベント受け口 */
app.post("/chat", async (req: Request, res: Response) => {
  const verified = await verifyChatRequest(req.header("authorization"));
  if (!verified.ok) {
    console.warn("[/chat] 検証失敗:", verified.reason);
    return res.status(401).json({ error: "unauthorized" });
  }

  try {
    const event = req.body as ChatEvent;
    const response = await handleChatEvent(event);
    return res.json(response);
  } catch (e) {
    // スタックトレースはレスポンスに含めない（サーバーログのみ）
    console.error("[/chat] 処理エラー", e);
    return res.status(500).json({ text: "内部エラーが発生しました。時間をおいて再度お試しください。" });
  }
});

/** OAuth 連携開始（S3 で本実装。userId を state に載せる） */
app.get("/oauth/start", (req: Request, res: Response) => {
  const userId = String(req.query.userId ?? "");
  if (!userId) return res.status(400).json({ error: "userId required" });
  try {
    return res.redirect(buildAuthUrl(userId));
  } catch (e) {
    console.error("[/oauth/start]", e);
    return res.status(500).json({ error: "oauth not configured" });
  }
});

app.listen(config.port, () => {
  console.log(
    `dgloss-brain-bot listening on :${config.port} (mockMode=${config.mockMode})`,
  );
});
