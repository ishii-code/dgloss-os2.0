/**
 * ユーザーOAuth（ACCESS_CONTROL §3 Phase 2 の本丸）。
 * ボットのサービスアカウントにドメインワイド委任はしない。各ユーザーが初回に連携し、
 * 本人のトークンで Drive/Gmail を検索する → 共有ドライブ権限がそのまま効く。
 *
 * トークンは tokenStore（暗号化保管・SECURITY T1）に保存する。
 */
import { OAuth2Client } from "google-auth-library";
import { config } from "../config.js";
import { getTokenStore, type StoredToken } from "./tokenStore.js";

export function createOAuthClient(): OAuth2Client {
  const { clientId, clientSecret, redirectUri } = config.oauth;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error("OAuth クライアント設定（CLIENT_ID/SECRET/REDIRECT_URI）が未設定です");
  }
  return new OAuth2Client({ clientId, clientSecret, redirectUri });
}

/** 認可URL生成（初回連携導線）。state に userId を載せてコールバックで紐付ける */
export function buildAuthUrl(userId: string): string {
  const client = createOAuthClient();
  return client.generateAuthUrl({
    access_type: "offline", // refresh_token を得る
    prompt: "consent",
    scope: [...config.oauth.scopes],
    state: userId,
  });
}

/** コールバックの認可コードをトークンに交換し、暗号化保存する */
export async function exchangeCodeForToken(code: string, userId: string): Promise<void> {
  const client = createOAuthClient();
  const { tokens } = await client.getToken(code);
  if (!tokens.access_token) throw new Error("access_token を取得できませんでした");
  const stored: StoredToken = {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token ?? undefined,
    expiryDate: tokens.expiry_date ?? undefined,
  };
  await getTokenStore().set(userId, stored);
}

/**
 * 質問者本人として API を叩くための認証済みクライアントを返す。
 * 未連携なら undefined（呼び出し側は「連携が必要」と案内する）。
 * リフレッシュ時は新しいトークンを暗号化保存し直す。
 */
export async function getUserAuthClient(userId: string): Promise<OAuth2Client | undefined> {
  const store = getTokenStore();
  const stored = await store.get(userId);
  if (!stored) return undefined;

  const client = createOAuthClient();
  client.setCredentials({
    access_token: stored.accessToken,
    refresh_token: stored.refreshToken,
    expiry_date: stored.expiryDate,
  });

  // 自動リフレッシュされたら保存し直す（本人スコープのまま）
  client.on("tokens", (t) => {
    void store.set(userId, {
      accessToken: t.access_token ?? stored.accessToken,
      refreshToken: t.refresh_token ?? stored.refreshToken,
      expiryDate: t.expiry_date ?? stored.expiryDate,
    });
  });

  return client;
}

/** 侵害時の緊急停止（全ユーザーの連携を失効）。件数を返す */
export async function revokeAllTokens(): Promise<number> {
  return getTokenStore().revokeAll();
}
