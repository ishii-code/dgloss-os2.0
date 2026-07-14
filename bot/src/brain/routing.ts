/**
 * モデルの役割別ルーティング（COST_DESIGN §2④）。
 * 大量発生する「読む・選ぶ」は安いモデル、最終合成だけ賢いモデルに任せる。
 * モデルIDはここで一元管理する（変更時はこの1ファイルだけ直す）。
 */

export const MODELS = {
  /** 検索結果の選別・抜粋、簡単なQ&A */
  cheap: "claude-haiku-4-5-20251001",
  /** 回答合成（標準） */
  standard: "claude-sonnet-4-6",
  /** 事業横断の分析・難問 */
  smart: "claude-opus-4-8",
} as const;

export type ModelTier = keyof typeof MODELS;

/**
 * 質問文から合成に使うモデルを選ぶ簡易ルーター。
 * 初版はヒューリスティック。将来は Haiku での事前分類に置き換え可能。
 */
export function pickSynthesisModel(question: string): { tier: ModelTier; model: string } {
  const q = question.toLowerCase();
  const analytical =
    /まとめ|要約|横断|比較|分析|なぜ|理由|傾向|全社|一覧|抽出|レビュー|評価/.test(question) ||
    /summary|analyze|compare|trend|why/.test(q) ||
    question.length > 120;

  const tier: ModelTier = analytical ? "smart" : "standard";
  return { tier, model: MODELS[tier] };
}
