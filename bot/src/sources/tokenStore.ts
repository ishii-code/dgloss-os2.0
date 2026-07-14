/**
 * ユーザーOAuthトークンの保管（SECURITY 判断1・T1）。
 * トークンは常に暗号化して保存する（平文で持たない）。一括失効(revokeAll)を備える。
 *  - 本番: Firestore に暗号化ブロブを保存
 *  - 開発(MOCK): インメモリ（暗号化往復は同じコードで実施）
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

/** 本番用。Firestore コレクションに暗号化ブロブを保存 */
class FirestoreTokenStore implements TokenStore {
  private readonly collection: string;
  constructor(collection: string) {
    this.collection = collection;
  }
  private async db() {
    const { Firestore } = await import("@google-cloud/firestore");
    return new Firestore();
  }
  async get(userId: string) {
    const db = await this.db();
    const snap = await db.collection(this.collection).doc(encodeKey(userId)).get();
    if (!snap.exists) return undefined;
    return decode(snap.data() as EncryptedBlob);
  }
  async set(userId: string, token: StoredToken) {
    const db = await this.db();
    await db.collection(this.collection).doc(encodeKey(userId)).set(await encode(token));
  }
  async delete(userId: string) {
    const db = await this.db();
    await db.collection(this.collection).doc(encodeKey(userId)).delete();
  }
  async revokeAll() {
    const db = await this.db();
    const docs = await db.collection(this.collection).listDocuments();
    let n = 0;
    // バッチ削除（500件ずつ）
    for (let i = 0; i < docs.length; i += 500) {
      const batch = db.batch();
      for (const d of docs.slice(i, i + 500)) batch.delete(d);
      await batch.commit();
      n += Math.min(500, docs.length - i);
    }
    return n;
  }
}

/** "users/123" 等をドキュメントIDに使える形へ */
function encodeKey(userId: string): string {
  return Buffer.from(userId).toString("base64url");
}

let cached: TokenStore | undefined;
export function getTokenStore(): TokenStore {
  if (cached) return cached;
  cached =
    !config.mockMode && config.firestore.collection
      ? new FirestoreTokenStore(config.firestore.collection)
      : new InMemoryTokenStore();
  return cached;
}
