/**
 * ログの機密度マスク（SECURITY 判断2＝案B）。
 * 通常の質問は本文を残し、機微語を含む/機密レベルL3以上に触れた質問だけ本文を伏せる。
 * これにより「改善に使える情報」を残しつつ、機微な質問文がログに平文で残るのを防ぐ。
 */

/** 機微とみなす語（給与・評価・個人情報・健康など）。運用で追記して育てる */
const SENSITIVE_PATTERNS: RegExp[] = [
  /給与|給料|年収|報酬|賞与|ボーナス|手当/,
  /人事評価|査定|考課|懲戒|解雇|降格/,
  /健康|病歴|既往|診断|メンタル|休職/,
  /マイナンバー|口座番号|クレジット|パスワード|パスポート|運転免許/,
  /個人情報|住所|生年月日/,
];

export interface MaskResult {
  text: string;
  masked: boolean;
}

/**
 * @param question 元の質問文
 * @param touchedL3 回答がL3以上の情報源に触れたか（将来、検索結果のlevelメタで判定）
 */
export function maskQuestion(question: string, touchedL3 = false): MaskResult {
  const hit = SENSITIVE_PATTERNS.some((re) => re.test(question));
  if (hit || touchedL3) {
    return { text: "[機微情報を含む可能性のため本文マスク]", masked: true };
  }
  return { text: question, masked: false };
}
