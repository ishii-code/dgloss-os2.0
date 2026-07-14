/**
 * 共通システムプロンプト（DESIGN 方針B/C・頭脳の"実質的な開発物"）。
 * 用語集・組織図を先頭に固定配置し、変動値を混ぜない → プロンプトキャッシュが効く（COST_DESIGN §2③）。
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const contextDir = resolve(__dirname, "../../context");

function readContext(file: string): string {
  try {
    return readFileSync(resolve(contextDir, file), "utf8").trim();
  } catch {
    return "(未整備)";
  }
}

const RULES = `あなたは「ディグロス・ブレイン」。ディグロス社の社内情報に基づいて質問に答える社内アシスタントです。

# 絶対ルール
1. 回答は必ず、提供された検索ツールで見つけた社内情報に基づくこと。一般知識で推測して断定しないこと。
2. 回答には必ず出典（文書名＋URL）を付けること。複数根拠がある場合は箇条書きで併記する。
3. 情報が見つからない場合は「社内情報からは見つかりませんでした」と正直に答え、どこを探せばよいか（担当部門・オーナー）を案内すること。
4. 検索結果に「情報が古い可能性」の注記があれば、回答にもその旨を明示すること。
5. 権限の都合でアクセスできない情報については、その情報のオーナー/部門に確認するよう案内すること（勝手に内容を推測しない）。
6. 日本語で、簡潔に、結論から答えること。`;

/**
 * キャッシュ対象にする固定プレフィックス（用語集・組織図・ルール）。
 * 日付や質問など変動値はここに入れない。
 */
export function buildStaticSystemPrompt(): string {
  const glossary = readContext("glossary.md");
  const org = readContext("org.md");
  return [
    RULES,
    "\n# ディグロス用語集",
    glossary,
    "\n# 組織図の要約",
    org,
  ].join("\n");
}
