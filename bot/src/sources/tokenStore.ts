/**
 * ユーザーOAuthトークンの保管（SECURITY 判断1・T1）。
 * トークンは常に暗号化して保存する（平文で持たない）。一括失効(revokeAll)を備える。
 *  - 本番: Supabase Postgres に暗号化ブロブを保存（dgloss標準 TECH_STACK）
 *  - 開発(MOCK): インメモリ（暗号化往復は同じコードで実施）
 *
 * テーブル定義（Supabase / SQL）:
 *   create table oauth_tokens (
 *     user_id text primary key,
 *     blob    jsonb not null,           -- EncryptedBlob（アプリ層で暗号化済）
 *     updated_at timestamptz default now()
 *   );
 *   alter table oauth_tokens enable row level security;  -- service_role のみアクセス
 */
import { config } from "../config.js";
import { getKeyManager } from "./keyManager.js";
import { encryptString, decryptString, type EncryptedBlob } from "./crypto.js";

export interface StoredToken {
  accessToken: string;
  refreshToken?: string;
  expiryDate?: number;
}

export interface TokenStore {
  get(userId: string): Promise<StoredToken | undefined>;
  set(userId: string, token: StoredToken): Promise<void>;
  delete(userId: string): Promise<void>;
  /** 侵害時の緊急停止：全ユーザーのトークンを削除し件数を返す */
  revokeAll(): Promise<number>;
}

async function encode(token: StoredToken): Promise<EncryptedBlob> {
  return encryptString(JSON.stringify(token), getKeyManager());
}
async function decode(blob: EncryptedBlob): Promise<StoredToken> {
  return JSON.parse(await decryptString(blob, getKeyManager())) as StoredToken;
}

/** 開発用（MOCK）。暗号化ブロブをメモリに保持 */
class InMemoryTokenStore implements TokenStore {
  private readonly map = new Map<string, EncryptedBlob>();
  async get(userId: string) {
    const blob = this.map.get(userId);
    return blob ? decode(blob) : undefined;
  }
  async set(userId: string, token: StoredToken) {
    this.map.set(userId, await encode(token));
  }
  async delete(userId: string) {
    this.map.delete(userId);
  }
  async revokeAll() {
    const n = this.map.size;
    this.map.clear();
    return n;
  }
}

/** 本番用。Supabase テーブルに暗号化ブロブを保存 */
class SupabaseTokenStore implements TokenStore {
  private readonly table: string;
  constructor(table: string) {
    this.table = table;
  }
  private async client() {
    const { createClient } = await import("@supabase/supabase-js");
    if (!config.supabase.url || !config.supabase.serviceRoleKey) {
      throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が未設定です");
    }
    return createClient(config.supabase.url, config.supabase.serviceRoleKey, {
      auth: { persistSession: false },
    });
  }
  async get(userId: string) {
    const db = await this.client();
    const { data, error } = await db.from(this.table).select("blob").eq("user_id", userId).maybeSingle();
    if (error) throw error;
    return data?.blob ? decode(data.blob as EncryptedBlob) : undefined;
  }
  async set(userId: string, token: StoredToken) {
    const db = await this.client();
    const blob = await encode(token);
    const { error } = await db.from(this.table).upsert({ user_id: userId, blob, updated_at: new Date().toISOString() });
    if (error) throw error;
  }
  async delete(userId: string) {
    const db = await this.client();
    const { error } = await db.from(this.table).delete().eq("user_id", userId);
    if (error) throw error;
  }
  async revokeAll() {
    const db = await this.client();
    // 件数を数えてから全削除
    const { count } = await db.from(this.table).select("*", { count: "exact", head: true });
    const { error } = await db.from(this.table).delete().neq("user_id", "");
    if (error) throw error;
    return count ?? 0;
  }
}

let cached: TokenStore | undefined;
export function getTokenStore(): TokenStore {
  if (cached) return cached;
  cached =
    !config.mockMode && config.supabase.url
      ? new SupabaseTokenStore(config.supabase.tokenTable)
      : new InMemoryTokenStore();
  return cached;
}
