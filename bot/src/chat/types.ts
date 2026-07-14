/**
 * Google Chat イベントの最小型定義（本ボットが使うフィールドのみ）。
 * 全APIレスポンスに型を付ける方針（any 禁止）。
 * 参考: https://developers.google.com/workspace/chat/api/reference/rest/v1/Event
 */

export interface ChatUser {
  name: string; // "users/123456789"
  displayName?: string;
  email?: string;
  type?: "HUMAN" | "BOT";
}

export interface ChatSpace {
  name: string; // "spaces/AAAA"
  type?: "ROOM" | "DM";
}

export interface ChatMessage {
  name?: string;
  text?: string;
  argumentText?: string; // メンションを除いた本文
  sender?: ChatUser;
  space?: ChatSpace;
  thread?: { name?: string };
}

export type ChatEventType = "ADDED_TO_SPACE" | "REMOVED_FROM_SPACE" | "MESSAGE";

export interface ChatEvent {
  type: ChatEventType;
  eventTime?: string;
  user?: ChatUser;
  space?: ChatSpace;
  message?: ChatMessage;
}

/** Chat への同期レスポンス（テキスト or カード） */
export interface ChatResponse {
  text: string;
  thread?: { name?: string };
}

/** ボットが1回の質問に対して扱う正規化済みリクエスト */
export interface BrainRequest {
  question: string;
  userId: string;
  userEmail?: string;
  spaceName?: string;
  threadName?: string;
}
