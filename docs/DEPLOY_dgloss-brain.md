# ディグロス・ブレイン Phase 2 — デプロイ運用手順書（S6）

`SETUP_GCP_dgloss-brain.md` が「人間側の設定（GCP/Supabase/Vercelの控える値の収集）」を扱うのに対し、
本書は **実際にVercelへデプロイして限定公開するまでの機械的な手順** をまとめる。

前提：コードは v1.5.0 時点で `tsc` 0件・スモーク・eval green（`bot/` で検証済み）。
基盤は dgloss標準 **Vercel(team: dg-bo) ＋ Supabase**。GCPは Chat/Drive/Gmail API と OAuth のみ。

---

## 0. 事前ブロッカー：Supabase 無料枠

ishii-code は無料プロジェクト2つまでで、org `dgloss-cg` で到達済み。次のいずれかで解消：

| 選択肢 | 内容 | 向き |
|---|---|---|
| A. 既存再利用 | 既存プロジェクトに本ボットの3テーブルを相乗り（スキーマ名/テーブル名の衝突なし） | 最速・無料 |
| B. 一時停止 | 未使用プロジェクトを pause して枠を空け、新規作成 | 無料・整理向き |
| C. Pro化 | org を Pro にアップグレード（$25/月〜） | 本番運用の安定重視 |

いずれでも `SUPABASE_URL` と `service_role` キーが手に入ればよい。リージョンは東京(`ap-northeast-1`)推奨。

---

## 1. Supabase：スキーマ適用

1. 対象プロジェクトの **SQL Editor** を開く
2. `bot/db/schema.sql` の**全文**を貼って実行（`oauth_tokens` / `customer_summaries` / `qa_logs`・RLS有効・索引込み）
3. `Table Editor` で3テーブルが作成され、いずれも **RLS: Enabled**（ポリシーなし＝service_roleのみアクセス）を確認

---

## 2. シークレット生成（実値はコミットしない）

Vercel 環境変数に入れる自己生成シークレットは、ローカルで生成して**Vercelの画面に直接貼る**。
リポジトリ・チャット・Issueには絶対に残さないこと。

```bash
# トークン暗号化マスター鍵(KEK・base64・32byte)
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"   # → TOKEN_MASTER_KEY

# 一括失効API保護トークン
node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"       # → ADMIN_API_TOKEN

# 夜間バッチ保護トークン（後述: CRON_SECRET と同値にする）
node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"       # → JOBS_API_TOKEN
```

> ⚠️ ローカル用の `TOKEN_MASTER_KEY` と本番の `TOKEN_MASTER_KEY` は**別値**。
> 本番鍵で暗号化したトークンはローカル鍵では復号できない（＝安全）。

---

## 3. Vercel：プロジェクト作成とデプロイ

### 3-1 プロジェクト作成
- team `dg-bo` に新規プロジェクトを作成し、このリポ（`ishii-code/dgloss-os2.0`）を接続
- **Root Directory = `bot`** に設定（重要。`bot/vercel.json` と `bot/api/index.ts` を関数として使う）
- Framework Preset = **Other**（Expressをそのまま関数化するため）
- Build/Install はデフォルトでよい（`npm install` → `api/index.ts` を関数化）

### 3-2 プラン確認
- `bot/vercel.json` の `functions.maxDuration = 300`（5分）は **Vercel Pro 必須**（Hobbyは60s上限で400になる）。
- dg-bo が Pro でない場合は Pro化するか、`maxDuration` を 60 に下げる（LLM+検索が60s超なら Pro 推奨）。

### 3-3 環境変数（Settings → Environment Variables、Production）
| 変数 | 値の出所 |
|---|---|
| `MOCK_MODE` | `false`（本番は必ず false） |
| `ASYNC_MODE` | `inline`（受付3秒以内=NFR-1のため。offだとLLM待ちで応答遅延） |
| `ANTHROPIC_API_KEY` | Anthropicコンソールで発行 |
| `SUPABASE_URL` | §1 |
| `SUPABASE_SERVICE_ROLE_KEY` | §1（service_role キー） |
| `GOOGLE_OAUTH_CLIENT_ID` | SETUP_GCP A-4 |
| `GOOGLE_OAUTH_CLIENT_SECRET` | SETUP_GCP A-4 |
| `OAUTH_REDIRECT_URI` | `https://<本番URL>/oauth/callback`（3-4で確定後に設定） |
| `GOOGLE_CLOUD_PROJECT_NUMBER` | SETUP_GCP A-1（Chat JWT audience 検証用） |
| `CHAT_APP_SA_KEY_JSON` | SETUP_GCP A-5（鍵JSONを1行化） |
| `CHAT_APP_SA_EMAIL` | SETUP_GCP A-5 |
| `TOKEN_MASTER_KEY` | §2 で生成 |
| `ADMIN_API_TOKEN` | §2 で生成 |
| `JOBS_API_TOKEN` | §2 で生成（次項で `CRON_SECRET` と同値に） |
| `CRON_SECRET` | **`JOBS_API_TOKEN` と同一値**を設定（下記） |
| `MAX_INPUT_TOKENS` | `100000`（任意・既定） |

> **Cron認証の要点**：`vercel.json` の Cron は毎回 `Authorization: Bearer <CRON_SECRET>` を送る。
> コード(`src/index.ts` の `/jobs/nightly-summary`)は `Bearer <JOBS_API_TOKEN>` と照合する。
> → **`CRON_SECRET` と `JOBS_API_TOKEN` を同じ文字列**にしないと夜間バッチが403になる。

### 3-4 デプロイ → URL確定 → GCP側URL更新
1. デプロイ実行 → 本番URL（例 `https://dgloss-brain.vercel.app`）が確定
2. `OAUTH_REDIRECT_URI` 環境変数をその `.../oauth/callback` に設定（未設定なら追記して再デプロイ）
3. GCP: OAuthクライアントの**承認済みリダイレクトURI**に `https://<本番URL>/oauth/callback` を追加（SETUP_GCP A-4）
4. GCP: Chatアプリの接続先HTTPエンドポイントを `https://<本番URL>/chat` に設定（SETUP_GCP A-5）

---

## 4. デプロイ後の検証（限定公開前チェック）

```bash
BASE=https://<本番URL>

# 4-1 ヘルスチェック（mockMode:false を確認）
curl -s $BASE/healthz
# 期待: {"ok":true,"mockMode":false}

# 4-2 OAuth連携（ブラウザ）
#   $BASE/oauth/start?userId=me を開く → Google許可 → "連携が完了しました" 表示
#   ※本番では /dev は無効（ALLOW_DEV_ASK未設定）。連携導線は /oauth/start を直接叩くか Chatカードから。

# 4-3 一括失効APIの保護（トークン不一致は403であること）
curl -s -o /dev/null -w "%{http_code}\n" -X POST $BASE/admin/revoke-all
# 期待: 403

# 4-4 夜間バッチの手動確認（正しいトークンで200・誤トークンで403）
curl -s -H "Authorization: Bearer <JOBS_API_TOKEN>" $BASE/jobs/nightly-summary
# 期待: {"ok":true,...}
```

Chat疎通（A-5登録後）：
- Google Chat で `@ディグロス頭脳` をDM/スペースに追加 → 初回連携案内が返る
- 質問 → 受付「調べています…」→ スレッドに**出典リンク付き回答**が追記される

---

## 5. 受け入れ基準（Phase 2完了の定義・IMPLEMENTATION §6と対応）

- [ ] `@頭脳` に質問でき、出典リンク付き回答が返る
- [ ] 他人メール・権限外ドライブが技術的に検索されない（**別ユーザーで検証**）
- [ ] 受付3秒以内 / 通常回答60秒以内（NFR-1。`ASYNC_MODE=inline` 前提）
- [ ] ゴールデンセットで回答成功率80%以上（`npm run eval`／実値埋め込み後）
- [ ] 全質問・回答・参照ページがログ(`qa_logs`)に記録される

---

## 6. インシデント対応（運用メモ）

- **トークン侵害時の緊急停止**：`curl -X POST $BASE/admin/revoke-all -H "x-admin-token: <ADMIN_API_TOKEN>"`（全ユーザー連携を失効）
- **ログ閲覧**：`qa_logs` は管理者+役員のみ（Supabase Studio/専用ロール経由）。一般公開しない
- セキュリティ方針の変更は **石井承認必須**（`SECURITY_dgloss-brain.md`）

---

## 7. 既知の残タスク（本番後のフォローアップ・任意）

デプロイのブロッカーではないが、運用で対応推奨：

1. **入力トークン上限ガード未配線**：`config.maxInputTokens` は `agent.ts` で未使用。COST_DESIGN §2⑥ の上限を効かせるなら要配線。
2. **L3参照アラート未実装**：`mask.ts` の `touchedL3` が常に false。検索結果に機密レベルのメタが付いたら true を渡す配線が必要（受け入れ基準の「L3参照時アラート」に対応）。
3. **夜間バッチ本体**：`nightlySummary.ts` は本番の顧客取得・要約がスタブ（骨格のみ）。Claude Batch API 連携は Phase 2 後半で実装。
4. **合成モデル**：`routing.ts` の標準は `claude-sonnet-4-6`（現行）。将来 `claude-sonnet-5` へ引き上げ可（任意）。
