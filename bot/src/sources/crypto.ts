/**
 * エンベロープ暗号化のヘルパ（SECURITY T1）。
 * トークン文字列を AES-256-GCM(データ鍵DEK) で暗号化し、DEK を KeyManager(KEK) で包む。
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import type { KeyManager } from "./keyManager.js";

export interface EncryptedBlob {
  ciphertext: string; // base64（トークン暗号文）
  iv: string; // base64（12byte nonce）
  authTag: string; // base64（16byte GCM tag）
  wrappedDek: string; // base64（KEKで包んだDEK）
  v: 1; // フォーマットバージョン
}

export async function encryptString(plain: string, km: KeyManager): Promise<EncryptedBlob> {
  const dek = randomBytes(32); // AES-256 のデータ鍵（1レコードごとに新規生成）
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", dek, iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const wrappedDek = await km.wrap(dek);
  return {
    ciphertext: ct.toString("base64"),
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
    wrappedDek: wrappedDek.toString("base64"),
    v: 1,
  };
}

export async function decryptString(blob: EncryptedBlob, km: KeyManager): Promise<string> {
  const dek = await km.unwrap(Buffer.from(blob.wrappedDek, "base64"));
  const decipher = createDecipheriv("aes-256-gcm", dek, Buffer.from(blob.iv, "base64"));
  decipher.setAuthTag(Buffer.from(blob.authTag, "base64"));
  const pt = Buffer.concat([
    decipher.update(Buffer.from(blob.ciphertext, "base64")),
    decipher.final(),
  ]);
  return pt.toString("utf8");
}
