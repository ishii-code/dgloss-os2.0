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
├─ api/index.ts           # Vercel Functions エントリ（Express app を公開）
├─ vercel.json            # Vercel設定（全パスを api/index へ・maxDuration）
├─ src/
│  ├─ index.ts            # Express app（/chat, /healthz, /oauth/*, /admin/revoke-all）
│  ├─ config.ts           # 環境変数の一元管理
│  ├─ chat/               # Google Chat 層（JWT検証・正規化・応答整形・非同期dispatch・投稿）
│  ├─ brain/              # 頭脳層（tool-useループ・システムプロンプト・モデルルーティング）
│  ├─ sources/            # データ層（ユーザーOAuth・暗号化トークン保管・Drive/Gmail検索）
│  └─ logging/            # QAログ・機密度マスク（監査/改善）
├─ context/               # 用語集・組織図（システムプロンプトの中核データ＝育てる資産）
└─ scripts/smoke.ts       # スモークテスト
```

デプロイ：**Vercel（team: dg-bo）＋ Supabase**（dgloss標準 TECH_STACK）。GCPはChat/Drive/Gmail APIとOAuthのみ。

## 本番投入までの残タスク

1. **S2** エージェントを実データ接続（Drive検索の抜粋整形強化）
2. **S5** ゴールデンセット回帰評価スクリプト
3. **S6** Vercelデプロイ・Supabaseテーブル作成・環境変数設定・Chatアプリ本登録・限定公開
（S3 OAuth＋暗号化トークン保管／S4 非同期応答 は実装済）

## 石井さん側で必要な設定

`../docs/SETUP_GCP_dgloss-brain.md`（Vercel＋Supabase＋GCP-API）の「控える値」を参照。
これらが揃うと MOCK_MODE=false で実データ疎通が可能になる。

## セキュリティ方針（要点）

- ボットに **ドメインワイド委任はしない**。検索は常に質問者本人のOAuthトークンで実行 → 共有ドライブ権限（L1〜L4）がそのまま効く
- トークンはアプリ層でエンベロープ暗号化し **Supabase** に保存（`SECURITY_dgloss-brain.md` T1）
- エラーレスポンスにスタックトレースを含めない（サーバーログのみ）
- APIキー・秘密は **Vercel環境変数** から注入（`.env` はローカル試用のみ・コミット禁止）
