# dgloss-brain-bot（Phase 2 Google Chat ボット）

ディグロス・ブレインの入り口。Google Chat で `@ディグロス頭脳 ○○様の契約条件は？` と聞くと、
**質問者本人の権限で** Google Drive / Gmail をライブ検索し、**出典リンク付き**で回答する。

- 設計: `../docs/DESIGN_dgloss-brain.md`
- 要件: `../docs/REQUIREMENTS_dgloss-brain.md`（v0.2）
- 権限: `../docs/ACCESS_CONTROL_dgloss-brain.md`
- コスト: `../docs/COST_DESIGN_dgloss-brain.md`
- 実装計画: `../docs/IMPLEMENTATION_dgloss-brain.md`

> ⚠ これは **S1 スケルトン** です。MOCK_MODE で一気通貫の起動・応答は確認できますが、
> 実データ疎通には GCP 側の設定（Chat API 登録・OAuthクライアント・APIキー）が必要です（実装計画 §2）。

## ローカルで動かす（MOCK_MODE・GCP設定不要）

```bash
cd bot
cp .env.example .env      # MOCK_MODE=true のまま
npm install
npm run smoke             # エージェント〜ハンドラの一気通貫スモークテスト
npm run dev               # サーバー起動（:8080）
# 別ターミナルで Chat イベントを模擬POST:
curl -s localhost:8080/chat -H 'content-type: application/json' \
  -d '{"type":"MESSAGE","message":{"argumentText":"シコメル様の契約条件は？","sender":{"name":"users/1","email":"gou@dgloss.example"}}}'
```

## ディレクトリ構成

```
bot/
├─ src/
│  ├─ index.ts            # Cloud Run エントリ（/chat, /healthz, /oauth/start）
│  ├─ config.ts           # 環境変数の一元管理
│  ├─ chat/               # Google Chat 層（JWT検証・イベント正規化・応答整形）
│  ├─ brain/              # 頭脳層（tool-useループ・システムプロンプト・モデルルーティング）
│  ├─ sources/            # データ層（ユーザーOAuth・Drive検索・Gmail検索）
│  └─ logging/            # QAログ・未回答ログ（監査/改善）
├─ context/               # 用語集・組織図（システムプロンプトの中核データ＝育てる資産）
├─ scripts/smoke.ts       # スモークテスト
└─ Dockerfile            # Cloud Run 用
```

## 本番投入までの残タスク（実装計画 §5 S2〜S6）

1. **S2** エージェントを実データ接続（Drive検索の抜粋整形強化）
2. **S3** ユーザーOAuthフロー本実装＋トークン永続化（Firestore）
3. **S4** 受付即応→非同期実行→Chat REST 追記投稿
4. **S5** QAログの永続化＋ゴールデンセット回帰評価
5. **S6** Dockerfile/Cloud Run デプロイ・Secret Manager 連携・Chatアプリ本登録

## 石井さん側（GCP設定）で必要なこと

実装計画書 `../docs/IMPLEMENTATION_dgloss-brain.md` §2 の「GCP設定」行を参照。
これらが揃うと MOCK_MODE=false で実データ疎通が可能になる。

## セキュリティ方針（要点）

- ボットのサービスアカウントに **ドメインワイド委任はしない**。検索は常に質問者本人のOAuthトークンで実行 → 共有ドライブ権限（L1〜L4）がそのまま効く
- エラーレスポンスにスタックトレースを含めない（サーバーログのみ）
- APIキー・OAuth秘密は Secret Manager から注入（`.env` はローカル試用のみ・コミット禁止）
