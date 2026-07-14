/**
 * 頭脳の中核。Anthropic Messages API の tool-use ループで
 * 「質問分解 → 検索ツール呼び出し → 出典付き合成」を回す（DESIGN §3 頭脳層）。
 *
 * コスト設計の反映（COST_DESIGN）:
 *  - 固定プレフィックス（用語集/組織図/ルール）に cache_control を付けキャッシュ（§2③）
 *  - 合成モデルは routing で選択（§2④）
 *  - 検索はツール側（Google API）で実行しLLMトークンを消費しない（§2①）
 */
import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config.js";
import { buildStaticSystemPrompt } from "./systemPrompt.js";
import { pickSynthesisModel } from "./routing.js";
import { toolDefinitions } from "./tools.js";
import { driveSearch } from "../sources/driveSearch.js";
import { gmailSearch } from "../sources/gmailSearch.js";
import type { BrainRequest } from "../chat/types.js";
import type { SearchResult } from "../sources/types.js";

export interface BrainResult {
  answer: string;
  model: string;
  citations: string[];
  toolCalls: number;
  usage?: { inputTokens: number; outputTokens: number };
}

const MAX_TURNS = 6;

export async function runBrain(req: BrainRequest): Promise<BrainResult> {
  if (config.mockMode || !config.anthropicApiKey) {
    return mockAnswer(req);
  }

  const client = new Anthropic({ apiKey: config.anthropicApiKey });
  const { model } = pickSynthesisModel(req.question);

  const system: Anthropic.TextBlockParam[] = [
    {
      type: "text",
      text: buildStaticSystemPrompt(),
      cache_control: { type: "ephemeral" }, // キャッシュ対象（COST_DESIGN §2③）
    },
  ];

  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: req.question },
  ];

  const citations = new Set<string>();
  let toolCalls = 0;
  let inputTokens = 0;
  let outputTokens = 0;

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const res = await client.messages.create({
      model,
      max_tokens: 1500,
      system,
      tools: toolDefinitions,
      messages,
    });
    inputTokens += res.usage.input_tokens;
    outputTokens += res.usage.output_tokens;

    messages.push({ role: "assistant", content: res.content });

    if (res.stop_reason !== "tool_use") {
      const answer = res.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
      return {
        answer: answer || "回答を生成できませんでした。",
        model,
        citations: [...citations],
        toolCalls,
        usage: { inputTokens, outputTokens },
      };
    }

    // ツール呼び出しを実行して結果を返す
    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const block of res.content) {
      if (block.type !== "tool_use") continue;
      toolCalls++;
      const result = await runTool(req.userId, block);
      for (const hit of result.hits) citations.add(hit.url);
      toolResults.push({
        type: "tool_result",
        tool_use_id: block.id,
        content: formatToolResult(result),
      });
    }
    messages.push({ role: "user", content: toolResults });
  }

  return {
    answer: "調査が長くなりすぎたため中断しました。質問を絞って再度お試しください。",
    model,
    citations: [...citations],
    toolCalls,
    usage: { inputTokens, outputTokens },
  };
}

async function runTool(
  userId: string,
  block: Anthropic.ToolUseBlock,
): Promise<SearchResult> {
  const input = block.input as { query?: string; max_results?: number };
  const query = input.query ?? "";
  const max = input.max_results ?? 5;
  switch (block.name) {
    case "drive_search":
      return driveSearch(userId, query, max);
    case "gmail_search":
      return gmailSearch(userId, query, max);
    default:
      return { hits: [], unavailableReason: `未知のツール: ${block.name}` };
  }
}

function formatToolResult(result: SearchResult): string {
  if (result.unavailableReason) {
    return `検索できませんでした: ${result.unavailableReason}`;
  }
  if (result.hits.length === 0) {
    return "該当する社内情報は見つかりませんでした。";
  }
  return result.hits
    .map((h, i) => {
      const stale = h.stale ? "（⚠情報が古い可能性）" : "";
      return `[${i + 1}] ${h.title}${stale}\n  抜粋: ${h.snippet}\n  出典URL: ${h.url}`;
    })
    .join("\n\n");
}

/** MOCK_MODE / APIキー未設定時のスタブ応答（S1 のローカル確認用） */
function mockAnswer(req: BrainRequest): BrainResult {
  const url = "https://docs.google.com/document/d/MOCK_DOC_ID/edit";
  return {
    answer:
      `【MOCK応答】「${req.question}」について、社内文書を1件見つけました（モック）。\n\n` +
      `- 概要: モック文書の要約がここに入ります。\n` +
      `- 出典: ${url}\n\n` +
      `※これは MOCK_MODE のスタブです。ANTHROPIC_API_KEY と Google 連携を設定すると実データで回答します。`,
    model: "mock",
    citations: [url],
    toolCalls: 0,
  };
}
