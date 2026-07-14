# 【依頼文】ディグロス・ブレイン Phase 2 — 環境設定のお願い

Google Chatボット（ディグロス・ブレイン）を実データで動かすための設定です。
デプロイ基盤は dgloss標準に合わせ **Vercel（team: dg-bo）＋ Supabase**。GCPは**APIとOAuthの提供元としてのみ**使います（compute/DBは持ちません）。
各手順の「控える値」を教えていただければ、こちらで接続して起動します。**所要45〜75分程度。**

セキュリティ方針は `SECURITY_dgloss-brain.md`（トークン暗号化・読み取り専用スコープ・ボットに全権を持たせない）に準拠。

---

## A. GCP側（APIとOAuthのみ）

### A-1 プロジェクト（新規作成）
GCPの「プロジェクト」＝APIや認証情報をまとめる箱。ディグロス・ブレイン専用の箱を1つ新規作成する。
1. https://console.cloud.google.com を開く
2. 画面上部の**プロジェクト選択（ドロップダウン）→ 新しいプロジェクト**
3. プロジェクト名：**`dgloss-brain`** → **作成**
4. 作成後、上部で `dgloss-brain` を選択した状態にする（以降の手順はこの箱の中で行う）
5. このプロジェクトに**課金アカウントを紐付け**（未設定なら「お支払い」から。費用はほぼ無料枠内）
- ※ Google Workspace とは別物。Workspaceを使っていてもGCPプロジェクトは別に必要。
- ※ 既存のdgloss用GCPプロジェクトがあればそれでも可（APXはAWSなので該当せず・通常は新規でよい）。
- **控える値①**：プロジェクトID／プロジェクト番号（数字12桁。ダッシュボードに表示）

### A-2 APIの有効化
「APIとサービス → ライブラリ」で有効化：
- [ ] Google Chat API　[ ] Google Drive API　[ ] Gmail API

### A-3 OAuth同意画面（ユーザーがボットに検索を許可する画面）
- ユーザータイプ **内部**（社内のみ）／アプリ名：`ディグロス・ブレイン`
- **スコープは読み取り専用のみ**：`drive.readonly` / `gmail.readonly` / `openid` / `email`

### A-4 OAuthクライアントID
- 認証情報 → OAuthクライアントID → **ウェブアプリケーション**
- 承認済みリダイレクトURI：`https://<VercelのURL>/oauth/callback`（VercelのURL確定後に設定・仮でも後追加可）
- **控える値②**：クライアントID／クライアントシークレット

### A-5 Chatアプリ登録＋投稿用サービスアカウント
- Google Chat API → 設定：アプリ名`ディグロス頭脳`／DM・スペース両対応
- 接続設定＝**HTTPエンドポイント** `https://<VercelのURL>/chat`（確定後）
- 投稿用にサービスアカウントを1つ作成し**鍵(JSON)を発行**（ボット→Chat投稿に使用）
- **控える値③**：Chatアプリのサービスアカウントのメール／鍵JSON（Vercel環境変数に格納）

---

## B. Supabase側（トークン保管）

### B-1 プロジェクト
- Supabase（org: dgloss）で新規プロジェクト作成／リージョン東京（`ap-northeast-1`）
- **控える値④**：`SUPABASE_URL` ／ `service_role` キー

### B-2 テーブル作成（SQL エディタで実行）
`bot/db/schema.sql` の**全文を貼って実行するだけ**（`oauth_tokens`／`customer_summaries`／`qa_logs` の3テーブル・RLS有効・索引込み）。
個別に作る必要はありません。RLSポリシーを作らない＝サーバの service_role キーのみアクセス可（匿名公開しない）。

---

## C. Vercel側（compute）

### C-1 プロジェクト
- team `dg-bo` に新規プロジェクト（このリポの `bot/` をルートに）
- デプロイはこちらで実施。権限（team メンバー招待 or デプロイ連携）をお願いします
- デプロイ後に **VercelのURL** が確定 → A-4/A-5 のURLをそれに更新

### C-2 環境変数（Vercel → Settings → Environment Variables）
こちらで設定しますが、値の準備をお願いします：
- `ANTHROPIC_API_KEY`（Anthropicコンソールで発行）
- `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`（B-1）
- `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET`（A-4）
- `CHAT_APP_SA_KEY_JSON`（A-5の鍵JSON・1行化）
- `TOKEN_MASTER_KEY`（トークン暗号化鍵・こちらで生成し登録）
- `ADMIN_API_TOKEN`（一括失効API保護・こちらで生成）
- `GOOGLE_CLOUD_PROJECT_NUMBER`（A-1）

---

## まとめて教えてほしい「控える値」
1. GCP プロジェクトID／番号
2. OAuthクライアントID／シークレット
3. Chatアプリのサービスアカウントのメール／鍵JSON
4. Supabase URL／service_role キー

これらが揃えば `MOCK_MODE=false` で接続し、限定公開で試用開始できます。
不明点は手順の番号（A-3等）を指定してください。

> 補足：**Cloud RunやCloud KMS/Firestoreは使いません**（当初案から変更）。トークンはSupabaseに暗号化保存し、
> compute はVercelのServerless Functionsで動きます（dgloss標準 TECH_STACK 準拠）。
