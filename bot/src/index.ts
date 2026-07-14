/**
 * Cloud Run エントリポイント。Google Chat の Webフックを受ける HTTP サーバー。
 */
import express from "express";
import type { Request, Response } from "express";
import { config } from "./config.js";
import { verifyChatRequest } from "./chat/verify.js";
import { handleChatEvent } from "./chat/handler.js";
import { buildAuthUrl, exchangeCodeForToken, revokeAllTokens } from "./sources/googleAuth.js";
import { processAndPost } from "./brain/process.js";
import type { ChatEvent, BrainRequest } from "./chat/types.js";

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

/** OAuth 連携開始（userId を state に載せる） */
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

/** OAuth コールバック：認可コードを暗号化トークンとして保存 */
app.get("/oauth/callback", async (req: Request, res: Response) => {
  const code = String(req.query.code ?? "");
  const userId = String(req.query.state ?? "");
  if (!code || !userId) return res.status(400).send("認可情報が不足しています。");
  try {
    await exchangeCodeForToken(code, userId);
    return res.send("連携が完了しました。Google Chat に戻って質問してください。");
  } catch (e) {
    console.error("[/oauth/callback]", e);
    return res.status(500).send("連携に失敗しました。時間をおいて再度お試しください。");
  }
});

/**
 * 非同期回答ワーカー（S4・ASYNC_MODE=cloudtasks）。Cloud Tasks から呼ばれ、
 * 頭脳を実行して Chat に回答を投稿する。共有トークンで保護（本番はOIDCも併用可）。
 */
app.post("/tasks/answer", async (req: Request, res: Response) => {
  const provided = req.header("x-task-token");
  if (config.tasks.token && provided !== config.tasks.token) {
    return res.status(403).json({ error: "forbidden" });
  }
  try {
    await processAndPost(req.body as BrainRequest);
    return res.status(204).end();
  } catch (e) {
    console.error("[/tasks/answer]", e);
    return res.status(500).json({ error: "processing failed" });
  }
});

/**
 * 一括失効（SECURITY §5・T1インシデント対応）。侵害時に全ユーザーのトークンを削除する。
 * 管理用の共有シークレット（ADMIN_API_TOKEN）が一致した場合のみ実行。
 */
app.post("/admin/revoke-all", async (req: Request, res: Response) => {
  const provided = req.header("x-admin-token");
  if (!config.admin.token || provided !== config.admin.token) {
    return res.status(403).json({ error: "forbidden" });
  }
  try {
    const count = await revokeAllTokens();
    console.warn(`[/admin/revoke-all] 全トークン失効 count=${count}`);
    return res.json({ revoked: count });
  } catch (e) {
    console.error("[/admin/revoke-all]", e);
    return res.status(500).json({ error: "revoke failed" });
  }
});

app.listen(config.port, () => {
  console.log(
    `dgloss-brain-bot listening on :${config.port} (mockMode=${config.mockMode})`,
  );
});
