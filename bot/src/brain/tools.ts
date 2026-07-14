/**
 * エージェントに渡すツール定義（Anthropic Messages API の tool use）。
 * ツールの実体は sources/* にあり、いずれも「質問者本人のOAuthトークン」で実行される。
 */
import type Anthropic from "@anthropic-ai/sdk";

export const toolDefinitions: Anthropic.Tool[] = [
  {
    name: "drive_search",
    description:
      "質問者本人がアクセスできる Google Drive / Docs を全文検索する。契約書・提案資料・議事録・会社Wiki・スプレッドシート等が対象。ヒットした文書のタイトル・抜粋・URL・最終更新日を返す。",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "検索キーワード（例: シコメル 契約 レベニューシェア）" },
        max_results: { type: "integer", description: "取得件数（既定5・最大10）", default: 5 },
      },
      required: ["query"],
    },
  },
  {
    name: "gmail_search",
    description:
      "質問者本人の Gmail のみを検索する（他人のメールは検索できない）。過去のやり取り・顧客対応履歴の確認に使う。件名・抜粋・差出人・日時・URLを返す。",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Gmail検索クエリ（例: from:client@example.com 契約）" },
        max_results: { type: "integer", description: "取得件数（既定5・最大10）", default: 5 },
      },
      required: ["query"],
    },
  },
];
