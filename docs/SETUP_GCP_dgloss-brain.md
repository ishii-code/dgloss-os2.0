# 【依頼文】ディグロス・ブレイン Phase 2 — GCP 設定のお願い

Google Chatボット（ディグロス・ブレイン）を実データで動かすために、Google Cloud 側の設定をお願いします。
コードは実装が進んでいますが、下記が揃うまで実データ疎通ができません（それまではモックで動作確認しています）。
各手順の最後にある「控える値」を教えていただければ、こちらで接続して起動します。

**所要：30〜60分程度。GCPの管理者（オーナー/編集者）権限が必要です。**
**セキュリティ方針**：`SECURITY_dgloss-brain.md` の決定に沿います（トークンは暗号化保管・読み取り専用スコープ・ボットに全権を持たせない）。

---

## 事前確認
- [ ] 使う Google Cloud プロジェクトを1つ決める（新規作成でも既存でも可）
- [ ] そのプロジェクトで**課金が有効**になっている
- [ ] Google Workspace の管理者と連携が取れる（OAuth同意画面の公開範囲設定で必要になる場合あり）

## 手順1：プロジェクト情報の確認
- GCPコンソール上部のプロジェクト選択 → 対象プロジェクトを選ぶ
- **控える値①**：プロジェクトID（例 `dgloss-brain-prod`）／プロジェクト番号（数字12桁）

## 手順2：APIの有効化
「APIとサービス → ライブラリ」で以下を検索し**有効化**：
- [ ] Google Chat API
- [ ] Google Drive API
- [ ] Gmail API
- [ ] Cloud KMS API
- [ ] Firestore API（Cloud Firestore）
- [ ] Secret Manager API
- [ ] Cloud Run API

## 手順3：Firestore（トークン等の保管先）
- 「Firestore」→ データベース作成 → **Nativeモード** → ロケーション `asia-northeast1`（東京）
- **控える値②**：Firestoreのロケーション（＝上記でOK）

## 手順4：Cloud KMS（トークン暗号化の鍵）※セキュリティの要
- 「セキュリティ → Key Management」→ キーリング作成
  - キーリング名：`dgloss-brain`／ロケーション：`asia-northeast1`
- 作成したキーリング内で鍵を作成
  - 鍵の名前：`token-encryption`／目的：**対称暗号化/復号**／ローテーション：90日（既定でOK）
- **控える値③**：鍵のリソース名（コピー可）
  `projects/PROJECT_ID/locations/asia-northeast1/keyRings/dgloss-brain/cryptoKeys/token-encryption`

## 手順5：OAuth同意画面（ユーザーがボットに検索を許可する画面）
- 「APIとサービス → OAuth同意画面」→ ユーザータイプ **内部**（社内のみ）を選択
- アプリ名：`ディグロス・ブレイン`／サポートメール：管理者アドレス
- **スコープ**に以下だけを追加（読み取り専用のみ・書き込みは不要）：
  - [ ] `.../auth/drive.readonly`
  - [ ] `.../auth/gmail.readonly`
  - [ ] `openid`, `email`

## 手順6：OAuthクライアントID（ユーザー認証用）
- 「APIとサービス → 認証情報 → 認証情報を作成 → OAuthクライアントID」
- 種類：**ウェブアプリケーション**
- 承認済みリダイレクトURI：`https://<Cloud RunのURL>/oauth/callback`
  （Cloud RunのURLは手順9で確定。仮でも後から追加可）
- **控える値④**：クライアントID／クライアントシークレット

## 手順7：Anthropic APIキーを Secret Manager に登録
- Anthropicコンソールで APIキーを発行（または既存を用意）
- 「セキュリティ → Secret Manager → シークレットを作成」
  - 名前：`anthropic-api-key`／値：発行したキー
- OAuthクライアントシークレットも同様に登録推奨（名前：`google-oauth-client-secret`）
- **控える値⑤**：登録したシークレット名（上記のとおりでOK）

## 手順8：Chatアプリの登録（ボットの受け口）
- 「Google Chat API → 設定（構成）」タブ
- アプリ名：`ディグロス頭脳`／アバター・説明を設定
- 機能：**スペースとグループ会話に参加**／**1対1メッセージを受信**の両方をON
- 接続設定：**HTTPエンドポイントURL** を選び、`https://<Cloud RunのURL>/chat`（手順9で確定後に設定）
- 公開範囲：社内（ドメイン全体、または特定グループで限定公開）
- **控える値⑥**：Chatアプリのサービスアカウントのメール（画面に表示される）

## 手順9：Cloud Run へのデプロイ枠
- デプロイはこちらで行いますが、権限が必要です。以下のいずれかをお願いします：
  - (a) こちらの作業アカウントに Cloud Run 管理者＋必要ロールを付与、または
  - (b) デプロイ用サービスアカウントを発行して共有
- デプロイ後に **Cloud RunのURL**（`https://dgloss-brain-xxxx.a.run.app`）が確定 → 手順6と手順8のURLをそれに更新
- ボット実行用サービスアカウントに付与する最小ロール（こちらで指定します）：
  - Firestore ユーザー（`roles/datastore.user`）
  - KMS 暗号化/復号（`roles/cloudkms.cryptoKeyEncrypterDecrypter`・対象鍵のみ）
  - Secret Manager アクセサー（`roles/secretmanager.secretAccessor`・対象シークレットのみ）
  - ※ **ドメインワイド委任は付与しない**（セキュリティ方針）

---

## まとめて教えてほしい「控える値」
1. プロジェクトID / プロジェクト番号
2. Firestoreロケーション（`asia-northeast1`）
3. KMS鍵のリソース名
4. OAuthクライアントID / シークレット（シークレットはSecret Manager経由で可）
5. Secret Manager のシークレット名（`anthropic-api-key` 等）
6. Chatアプリのサービスアカウントのメール

これらをいただければ `MOCK_MODE=false` で接続し、限定公開で試用開始できます。
不明点があれば、この手順書の番号を指定してください。こちらで補足します。
