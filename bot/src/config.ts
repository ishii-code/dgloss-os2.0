/**
 * 環境変数の一元読み込み。サーバーサイドのみで参照する（NEXT_PUBLIC_ 等の露出はしない）。
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

  /** モックモード: GCP/Anthropic 設定前でもローカル起動・単体確認できるようにする */
  mockMode: env("MOCK_MODE", "true").toLowerCase() === "true",

  anthropicApiKey: optionalEnv("ANTHROPIC_API_KEY"),

  chat: {
    projectNumber: optionalEnv("GOOGLE_CLOUD_PROJECT_NUMBER"),
    appServiceAccountEmail: optionalEnv("CHAT_APP_SA_EMAIL"),
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

  /** 1質問あたり入力トークン上限（COST_DESIGN §2⑥） */
  maxInputTokens: Number(env("MAX_INPUT_TOKENS", "100000")),
} as const;

export type Config = typeof config;
