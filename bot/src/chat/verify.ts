/**
 * Google Chat からのリクエスト検証。
 * Chat は各リクエストに Bearer JWT を付ける。発行者は chat@system.gserviceaccount.com、
 * audience は自分のプロジェクト番号。これを検証して「本物の Google Chat からの呼び出し」だけを通す。
 * 参考: https://developers.google.com/workspace/chat/authenticate-authorize-chat-app
 */
import { OAuth2Client } from "google-auth-library";
import { config } from "../config.js";

const CHAT_ISSUER = "chat@system.gserviceaccount.com";
const authClient = new OAuth2Client();

export interface VerifyResult {
  ok: boolean;
  reason?: string;
}

export async function verifyChatRequest(authorizationHeader: string | undefined): Promise<VerifyResult> {
  if (config.mockMode) return { ok: true };

  if (!authorizationHeader?.startsWith("Bearer ")) {
    return { ok: false, reason: "Authorization ヘッダが無い/Bearer でない" };
  }
  if (!config.chat.projectNumber) {
    return { ok: false, reason: "GOOGLE_CLOUD_PROJECT_NUMBER 未設定" };
  }

  const token = authorizationHeader.slice("Bearer ".length);
  try {
    const ticket = await authClient.verifyIdToken({
      idToken: token,
      audience: config.chat.projectNumber,
    });
    const payload = ticket.getPayload();
    if (payload?.iss !== CHAT_ISSUER) {
      return { ok: false, reason: `想定外の発行者: ${payload?.iss}` };
    }
    return { ok: true };
  } catch (e) {
    // スタックトレースはレスポンスに含めない（サーバーログのみ）
    console.error("[verifyChatRequest] JWT検証失敗", e);
    return { ok: false, reason: "JWT検証失敗" };
  }
}
