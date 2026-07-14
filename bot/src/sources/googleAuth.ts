/**
 * ユーザーOAuth（ACCESS_CONTROL §3 Phase 2 の本丸）。
 * ボットのサービスアカウントにドメインワイド委任はしない。各ユーザーが初回に連携し、
 * 本人のトークンで Drive/Gmail を検索する → 共有ドライブ権限がそのまま効く。
 *
 * S3 でトークン永続化（Firestore 想定）とリフレッシュを実装する。
 * ここでは OAuth クライアント生成とトークンストアのインターフェースを定義する。
 */
import { OAuth2Client } from "google-auth-library";
import { config } from "../config.js";

/** userId（"users/123"）→ 保存済みトークン。S3 で Firestore 実装に差し替える */
export interface TokenStore {
  get(userId: string): Promise<StoredToken | undefined>;
  set(userId: string, token: StoredToken): Promise<void>;
}

export interface StoredToken {
  accessToken: string;
  refreshToken?: string;
  expiryDate?: number;
}

/** 開発用のインメモリ実装（本番は Firestore） */
class InMemoryTokenStore implements TokenStore {
  private readonly map = new Map<string, StoredToken>();
  async get(userId: string) {
    return this.map.get(userId);
  }
  async set(userId: string, token: StoredToken) {
    this.map.set(userId, token);
  }
}

export const tokenStore: TokenStore = new InMemoryTokenStore();

export function createOAuthClient(): OAuth2Client {
  const { clientId, clientSecret, redirectUri } = config.oauth;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error("OAuth クライアント設定（CLIENT_ID/SECRET/REDIRECT_URI）が未設定です");
  }
  return new OAuth2Client({ clientId, clientSecret, redirectUri });
}

/** 認可URL生成（初回連携導線・S3 で /oauth/start から使う） */
export function buildAuthUrl(userId: string): string {
  const client = createOAuthClient();
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [...config.oauth.scopes],
    state: userId,
  });
}

/**
 * 質問者本人として API を叩くための認証済みクライアントを返す。
 * 未連携なら undefined（呼び出し側は「連携が必要」と案内する）。
 */
export async function getUserAuthClient(userId: string): Promise<OAuth2Client | undefined> {
  const stored = await tokenStore.get(userId);
  if (!stored) return undefined;
  const client = createOAuthClient();
  client.setCredentials({
    access_token: stored.accessToken,
    refresh_token: stored.refreshToken,
    expiry_date: stored.expiryDate,
  });
  return client;
}
