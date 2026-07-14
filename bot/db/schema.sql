-- ディグロス・ブレイン Supabase スキーマ
-- Supabase の SQL エディタにこの全文を貼って実行する（設定作業はこれ1回）。
-- 全テーブルで RLS を有効化し、ポリシーを作らない＝サーバの service_role キーのみアクセス可
-- （匿名/authenticated からは一切読めない）。閲覧は後述の運用で管理者+役員に限定。

-- 1) OAuthトークン（アプリ層でエンベロープ暗号化済のブロブ・SECURITY T1）
create table if not exists oauth_tokens (
  user_id    text primary key,
  blob       jsonb not null,
  updated_at timestamptz not null default now()
);
alter table oauth_tokens enable row level security;

-- 2) 顧客サマリー（夜間バッチ・COST_DESIGN §2⑤）
create table if not exists customer_summaries (
  customer_id  text primary key,
  name         text not null,
  summary      text not null,
  generated_at timestamptz not null default now()
);
alter table customer_summaries enable row level security;

-- 3) QAログ（監査/改善・ACCESS_CONTROL §6。question は機密度マスク済＝案B）
create table if not exists qa_logs (
  id             bigint generated always as identity primary key,
  ts             timestamptz not null default now(),
  user_id        text not null,
  question       text not null,
  masked         boolean not null default false,
  model          text,
  answered       boolean not null,
  citation_count int not null default 0,
  tool_calls     int not null default 0,
  input_tokens   int,
  output_tokens  int
);
alter table qa_logs enable row level security;
create index if not exists qa_logs_ts_idx on qa_logs (ts desc);
-- 未回答（データ整備の対象）を速く集計するための部分索引
create index if not exists qa_logs_unanswered_idx on qa_logs (ts desc) where answered = false;

-- 運用メモ：
--  - アプリは service_role キーで書き込む（サーバ専用・NEXT_PUBLIC_禁止）
--  - qa_logs の閲覧は管理者+役員のみ。Studio/専用ロール経由で参照し、一般公開しない
--  - トークン失効は /admin/revoke-all（oauth_tokens 全削除）
