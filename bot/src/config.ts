/**
 * 環境変数の一元読み込み。サーバーサイドのみで参照する（NEXT_PUBLIC_ 等の露出はしない）。
 * デプロイ基盤は dgloss標準（TECH_STACK）に合わせ Vercel + Supabase。
 */

function env(key: string, fallback?: string): string {
  const v = process.env[key] ?? fallback;
  if (v === undefined) throw new Error(`環境変数 ${key} が未設定です`);
  return v;
}

function optionalEnv(key: string): string | undefined {
  const v = process.env[key];
  return v && v.length > 0 ? v : undefined;
}

export const config = {
  port: Number(env("PORT", "8080")),

  /** モックモード: Supabase/Anthropic/Google 設定前でもローカル起動・単体確認できる */
  mockMode: env("MOCK_MODE", "true").toLowerCase() === "true",

  anthropicApiKey: optionalEnv("ANTHROPIC_API_KEY"),

  chat: {
    /** Chat JWT の audience 検証に使うGCPプロジェクト番号 */
    projectNumber: optionalEnv("GOOGLE_CLOUD_PROJECT_NUMBER"),
    appServiceAccountEmail: optionalEnv("CHAT_APP_SA_EMAIL"),
    /** ボット→Chat投稿用のサービスアカウント鍵JSON（Vercel環境変数に格納） */
    appServiceAccountKey: optionalEnv("CHAT_APP_SA_KEY_JSON"),
  },

  oauth: {
    clientId: optionalEnv("GOOGLE_OAUTH_CLIENT_ID"),
    clientSecret: optionalEnv("GOOGLE_OAUTH_CLIENT_SECRET"),
    redirectUri: optionalEnv("OAUTH_REDIRECT_URI"),
    /** 本人権限のみ・読み取り専用スコープ（ACCESS_CONTROL 方針D） */
    scopes: [
      "https://www.googleapis.com/auth/drive.readonly",
      "https://www.googleapis.com/auth/gmail.readonly",
      "openid",
      "email",
    ],
  },

  /** トークン保管（SECURITY 判断1・T1）。Supabase Postgres に暗号化ブロブを保存 */
  supabase: {
    url: optionalEnv("SUPABASE_URL"),
    serviceRoleKey: optionalEnv("SUPABASE_SERVICE_ROLE_KEY"),
    tokenTable: optionalEnv("SUPABASE_TOKEN_TABLE") ?? "oauth_tokens",
    qaTable: optionalEnv("SUPABASE_QA_TABLE") ?? "qa_logs",
  },

  /**
   * トークン暗号化のマスター鍵(KEK)。base64・32byte。Vercel環境変数に格納。
   * 本番の推奨は Supabase Vault(pgsodium) 管理へ移行（SECURITY §3 T1 フォローアップ）。
   */
  tokenMasterKeyB64: optionalEnv("TOKEN_MASTER_KEY"),

  /** 一括失効API等の管理操作を許可する共有シークレット */
  admin: {
    token: optionalEnv("ADMIN_API_TOKEN"),
  },

  /** 非同期回答（S4）。off=同期 / inline=応答後に waitUntil で背景実行（Vercel） */
  async: {
    mode: (optionalEnv("ASYNC_MODE") ?? "off") as "off" | "inline",
  },

  /** 夜間バッチ（COST_DESIGN §2⑤・Vercel Cron） */
  jobs: {
    /** /jobs/* 保護用（Vercel Cron の Authorization: Bearer と一致させる） */
    token: optionalEnv("JOBS_API_TOKEN"),
    summaryTable: optionalEnv("SUPABASE_SUMMARY_TABLE") ?? "customer_summaries",
  },

  /** 1質問あたり入力トークン上限（COST_DESIGN §2⑥） */
  maxInputTokens: Number(env("MAX_INPUT_TOKENS", "100000")),
} as const;

export type Config = typeof config;
