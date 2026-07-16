/**
 * HTTPアプリ本体（Express）。Google Chat の Webフックを受ける。
 * デプロイは Vercel（`api/index.ts` がこの app を関数として公開）。ローカルは app.listen で起動。
 */
import "dotenv/config"; // ローカルは bot/.env を自動読込（Vercelは環境変数を注入するので無害）
import express from "express";
import type { Request, Response } from "express";
import { config } from "./config.js";
import { verifyChatRequest } from "./chat/verify.js";
import { handleChatEvent } from "./chat/handler.js";
import { buildAuthUrl, exchangeCodeForToken, revokeAllTokens } from "./sources/googleAuth.js";
import { runNightlySummary } from "./jobs/nightlySummary.js";
import { processAnswer } from "./brain/process.js";
import type { ChatEvent } from "./chat/types.js";

export const app = express();
app.use(express.json({ limit: "1mb" }));

/**
 * 開発用エンドポイント（ローカル動作確認）。ALLOW_DEV_ASK=1 のときだけ有効。
 * Chat の JWT 検証を経ずに質問→出典付き回答を試せる（本番では絶対に有効化しない）。
 *   curl -s localhost:8080/dev/ask -H 'content-type: application/json' -d '{"question":"...","userId":"me"}'
 */
if (process.env.ALLOW_DEV_ASK === "1") {
  app.post("/dev/ask", async (req: Request, res: Response) => {
    const body = req.body as { question?: string; userId?: string };
    if (!body.question) return res.status(400).json({ error: "question required" });
    try {
      const result = await processAnswer({ question: body.question, userId: body.userId ?? "dev" });
      return res.json({ answer: result.answer, citations: result.citations, model: result.model });
    } catch (e) {
      console.error("[/dev/ask]", e);
      return res.status(500).json({ error: "failed" });
    }
  });

  // ブラウザで使える簡易ページ（開発用）
  app.get("/dev", (_req: Request, res: Response) => {
    res.type("html").send(DEV_PAGE_HTML);
  });

  console.log("[dev] /dev（画面）と /dev/ask 有効（開発用・本番禁止）");
}

/** ローカル動作確認用の簡易UI（ALLOW_DEV_ASK=1のときだけ /dev で配信） */
const DEV_PAGE_HTML = `<!doctype html>
<html lang="ja"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>ディグロス・ブレイン（ローカル）</title>
<style>
  :root{ --y:#FCB900; --o:#FF6900; --tx:#1A1A1A; }
  *{box-sizing:border-box} body{font-family:-apple-system,BlinkMacSystemFont,"Hiragino Sans",sans-serif;color:var(--tx);max-width:760px;margin:0 auto;padding:24px;background:#faf9f7}
  h1{font-size:20px;display:flex;align-items:center;gap:8px} .dot{width:14px;height:14px;border-radius:50%;background:var(--y)}
  .bar{display:flex;gap:8px;margin:16px 0} textarea{flex:1;min-height:56px;padding:12px;font-size:16px;border:1px solid #ddd;border-radius:10px;resize:vertical}
  button{background:var(--y);border:none;border-radius:10px;padding:0 20px;font-size:16px;font-weight:700;cursor:pointer;min-height:48px}
  button:disabled{opacity:.5;cursor:default} a.link{color:var(--o);font-size:13px}
  .ans{white-space:pre-wrap;background:#fff;border:1px solid #eee;border-radius:12px;padding:16px;margin-top:8px;line-height:1.7}
  .cites{margin-top:12px} .cites a{display:block;color:var(--o);font-size:14px;margin:4px 0;text-decoration:none} .cites a:hover{text-decoration:underline}
  .meta{color:#999;font-size:12px;margin-top:8px} .hint{color:#888;font-size:13px}
</style></head>
<body>
  <h1><span class="dot"></span>ディグロス・ブレイン <span class="hint">（ローカル動作確認）</span></h1>
  <p class="hint">初回は <a class="link" href="/oauth/start?userId=me" target="_blank">① Googleを連携</a> してから質問してください（自分のDrive/Gmailを本人権限で検索します）。</p>
  <div class="bar">
    <textarea id="q" placeholder="例：先週の〇〇社との打ち合わせで決まったことは？"></textarea>
    <button id="ask">質問</button>
  </div>
  <div id="out"></div>
<script>
  const q=document.getElementById('q'), btn=document.getElementById('ask'), out=document.getElementById('out');
  async function ask(){
    const question=q.value.trim(); if(!question) return;
    btn.disabled=true; out.innerHTML='<p class="hint">調べています…</p>';
    try{
      const r=await fetch('/dev/ask',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({question,userId:'me'})});
      const d=await r.json();
      if(!r.ok){ out.innerHTML='<p class="ans">エラー: '+(d.error||r.status)+'</p>'; return; }
      let html='<div class="ans">'+(d.answer||'(空)').replace(/&/g,'&amp;').replace(/</g,'&lt;')+'</div>';
      if(d.citations&&d.citations.length){ html+='<div class="cites"><b>出典</b>'+d.citations.map(function(u){return '<a href="'+u+'" target="_blank">'+u+'</a>'}).join('')+'</div>'; }
      html+='<div class="meta">model: '+(d.model||'-')+'</div>';
      out.innerHTML=html;
    }catch(e){ out.innerHTML='<p class="ans">通信エラー: '+e+'</p>'; }
    finally{ btn.disabled=false; }
  }
  btn.onclick=ask;
  q.addEventListener('keydown',function(e){ if((e.metaKey||e.ctrlKey)&&e.key==='Enter') ask(); });
</script>
</body></html>`;

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

/**
 * 夜間バッチ（COST_DESIGN §2⑤）。Vercel Cron が定時にGETで叩く。
 * Vercel Cron は Authorization: Bearer <CRON_SECRET> を付与するので、JOBS_API_TOKEN と一致検証する。
 */
app.get("/jobs/nightly-summary", async (req: Request, res: Response) => {
  const authz = req.header("authorization");
  if (config.jobs.token && authz !== `Bearer ${config.jobs.token}`) {
    return res.status(403).json({ error: "forbidden" });
  }
  try {
    const result = await runNightlySummary();
    return res.json({ ok: true, ...result });
  } catch (e) {
    console.error("[/jobs/nightly-summary]", e);
    return res.status(500).json({ error: "job failed" });
  }
});

// ローカル/常駐実行時のみ listen（Vercel 上では api/index.ts が app を関数化するため不要）
if (!process.env.VERCEL) {
  app.listen(config.port, () => {
    console.log(`dgloss-brain-bot listening on :${config.port} (mockMode=${config.mockMode})`);
  });
}
