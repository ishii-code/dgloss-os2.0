/** 検索ツール共通の結果型（出典の素材） */
export interface SearchHit {
  title: string;
  snippet: string;
  url: string;
  source: "drive" | "gmail";
  /** ISO日付。鮮度警告（DESIGN 方針B-3）の判定に使う */
  lastModified?: string;
  /** true の場合、回答に「情報が古い可能性」を付す */
  stale?: boolean;
}

export interface SearchResult {
  hits: SearchHit[];
  /** 権限やトークン未連携で検索できなかった場合の理由（回答で案内に使う） */
  unavailableReason?: string;
}
