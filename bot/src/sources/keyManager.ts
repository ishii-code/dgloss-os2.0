/**
 * 鍵管理（SECURITY 判断1・T1対策の中核）。
 * トークンは「エンベロープ暗号化」で守る：データ鍵(DEK)でトークンを暗号化し、
 * DEK自体をマスター鍵(KEK)で暗号化して保存する。
 *
 * KEK は Vercel 環境変数の TOKEN_MASTER_KEY（base64・32byte）を使う（AES-256-GCM）。
 * ⚠本番のさらなる堅牢化：Supabase Vault(pgsodium) 管理へ移行する（SECURITY §3 T1）。
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { config } from "../config.js";

/** DEK を包む/解く（KEK操作） */
export interface KeyManager {
  wrap(dek: Buffer): Promise<Buffer>;
  unwrap(wrapped: Buffer): Promise<Buffer>;
}

/** AES-256-GCM でローカルにKEKを保持して DEK を包む実装 */
class AesGcmKeyManager implements KeyManager {
  constructor(private readonly kek: Buffer) {
    if (kek.length !== 32) throw new Error("KEK は32バイト(base64)である必要があります");
  }

  async wrap(dek: Buffer): Promise<Buffer> {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.kek, iv);
    const ct = Buffer.concat([cipher.update(dek), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), ct]); // iv(12)|tag(16)|ct
  }

  async unwrap(wrapped: Buffer): Promise<Buffer> {
    const iv = wrapped.subarray(0, 12);
    const tag = wrapped.subarray(12, 28);
    const ct = wrapped.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", this.kek, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]);
  }
}

let cached: KeyManager | undefined;

export function getKeyManager(): KeyManager {
  if (cached) return cached;
  const raw = config.tokenMasterKeyB64;
  if (config.mockMode && !raw) {
    // 開発用の固定鍵（安全でない・MOCKのみ）
    cached = new AesGcmKeyManager(Buffer.alloc(32, 7));
    return cached;
  }
  if (!raw) throw new Error("TOKEN_MASTER_KEY(base64,32byte) が未設定です");
  cached = new AesGcmKeyManager(Buffer.from(raw, "base64"));
  return cached;
}
