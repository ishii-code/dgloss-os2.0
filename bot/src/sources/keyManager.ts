/**
 * 鍵管理（SECURITY 判断1・T1対策の中核）。
 * トークンは「エンベロープ暗号化」で守る：
 *   データ鍵(DEK)でトークンを暗号化し、DEK自体を鍵管理(KEK)で暗号化して保存する。
 * KEK は本番では Cloud KMS（鍵はGCP内に留まり外に出ない）、ローカル開発では簡易鍵を使う。
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { config } from "../config.js";

/** DEK を包む/解く（KEK操作）。実体は KMS かローカル開発鍵 */
export interface KeyManager {
  wrap(dek: Buffer): Promise<Buffer>;
  unwrap(wrapped: Buffer): Promise<Buffer>;
}

/**
 * Cloud KMS 実装（本番）。鍵リソースは config.kms.keyName。
 * @google-cloud/kms を動的 import して、未設定環境でも起動を妨げないようにする。
 */
class KmsKeyManager implements KeyManager {
  constructor(private readonly keyName: string) {}

  private async client() {
    const { KeyManagementServiceClient } = await import("@google-cloud/kms");
    return new KeyManagementServiceClient();
  }

  async wrap(dek: Buffer): Promise<Buffer> {
    const client = await this.client();
    const [res] = await client.encrypt({ name: this.keyName, plaintext: dek });
    if (!res.ciphertext) throw new Error("KMS encrypt が空を返しました");
    return Buffer.from(res.ciphertext as Uint8Array);
  }

  async unwrap(wrapped: Buffer): Promise<Buffer> {
    const client = await this.client();
    const [res] = await client.decrypt({ name: this.keyName, ciphertext: wrapped });
    if (!res.plaintext) throw new Error("KMS decrypt が空を返しました");
    return Buffer.from(res.plaintext as Uint8Array);
  }
}

/**
 * ローカル開発用（MOCK_MODE）。KEK を AES-256-GCM でローカル保持。
 * ⚠本番では使わない。KMS が使えない環境で暗号化の往復を確認するためのもの。
 */
class LocalDevKeyManager implements KeyManager {
  private readonly kek: Buffer;
  constructor() {
    // DEV_MASTER_KEY(base64,32byte) があれば使い、無ければ固定の開発鍵（安全でない）
    const raw = config.dev.masterKeyB64;
    this.kek = raw ? Buffer.from(raw, "base64") : Buffer.alloc(32, 7);
    if (this.kek.length !== 32) throw new Error("DEV_MASTER_KEY は32バイト(base64)である必要があります");
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
  if (!config.mockMode && config.kms.keyName) {
    cached = new KmsKeyManager(config.kms.keyName);
  } else {
    cached = new LocalDevKeyManager();
  }
  return cached;
}
