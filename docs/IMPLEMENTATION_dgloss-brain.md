# ディグロス・ブレイン 実装計画書（Phase 2：Google Chatボット）

設計3書（`DESIGN` / `REQUIREMENTS` v0.2 / `ACCESS_CONTROL` / `COST_DESIGN`）を前提に、
**実際にコードを書く部分（Phase 2 Google Chatボット）** の実装計画をまとめる。
スケルトン実装は `/bot` 配下。

---

## 0. Phase 1 は「開発ゼロ」— 先に石井さん側で着手できること

コードなしで今日から始められる（`DESIGN` §4 Phase 1）。Phase 2 の開発と並行して進める：

- [ ] Claude（Team/Enterprise）に Google Drive / Gmail / カレンダー コネクタを接続
- [ ] 経営陣数名で1週間試用し「答えられなかった質問」をスプレッドシートに記録
- [ ] ディグロス文脈プロンプト v1 を作成（→ `bot/context/glossary.md` `org.md` の元データになる）
- [ ] 評価用質問リスト（まず10問）を作成 → 後の `eval/golden-set.jsonl`

---

## 1. スコープ（この計画で作るもの）

`@ディグロス頭脳 ○○様の契約条件は？` に、**質問者本人の権限で** Google Drive/Gmail を
ライブ検索し、**出典リンク付き**で回答する Google Chat ボット。

方式は `DESIGN` §2 方針A の「エージェント検索型①」。RAG（Phase 3）はまだ作らない。

## 2. 誰が何をやるか（役割分担）

| 区分 | タスク | 担当 |
|---|---|---|
| GCP設定 | GCPプロジェクト作成・課金有効化 | 石井 |
| GCP設定 | Google Chat API 有効化・Chatアプリ登録（アプリ名/アバター/スコープ） | 石井 |
| GCP設定 | OAuth同意画面の設定＋スコープ申請（drive.readonly / gmail.readonly など） | 石井 |
| GCP設定 | Secret Manager に `ANTHROPIC_API_KEY`・OAuthクライアント秘密を登録 | 石井 |
| GCP設定 | Cloud Run デプロイ権限・サービスアカウント発行 | 石井 |
| 権限整備 | 共有ドライブ L1〜L4 再編・Googleグループ整備（`ACCESS_CONTROL` §5） | 石井＋管理者 |
| コード | Chat Webフック受け口・JWT検証（`bot/src/chat`） | 開発（実装済スケルトン） |
| コード | Claude エージェント・ツールループ・モデルルーティング（`bot/src/brain`） | 開発 |
| コード | ユーザーOAuth・Drive/Gmail検索ツール（`bot/src/sources`） | 開発 |
| コード | QAログ・未回答ログ（`bot/src/logging`） | 開発 |
| コード | Dockerfile・Cloud Run デプロイ | 開発 |

**ブロッカー**：コードは書けるが、エンドツーエンドの疎通確認には上記GCP設定（特に Chat API 登録・OAuthクライアント・APIキー）が必要。スケルトンはモックで単体起動できるようにしてある。

## 3. アーキテクチャ（Phase 2 実装）

```
Google Chat (@メンション/DM)
      │  HTTPS POST（Bearer JWT）
      ▼
Cloud Run（Node/TypeScript, Express）      ← bot/src/index.ts
      │  ① JWT検証（発行者=chat@system.gserviceaccount.com）
      │  ② 3秒以内に受付応答（"調べています…"）を返す
      │  ③ 非同期でエージェント実行 → 完了後に Chat REST で追記投稿
      ▼
Claude エージェント（Anthropic Messages API + tool use）  ← bot/src/brain/agent.ts
      │  質問分解 → 検索ツール呼び出し → 出典付き合成
      │  モデルルーティング（選別=Haiku / 合成=Sonnet / 難問=Opus）
      ▼
検索ツール（質問者のOAuthトークンで本人として実行）  ← bot/src/sources/*
   ├ drive_search : Drive/Docs 全文検索 → タイトル・抜粋・URL
   └ gmail_search : 本人Gmail検索（本人スコープのみ）
```

権限の肝（`ACCESS_CONTROL` §3 Phase 2）：**ボットのサービスアカウントにドメインワイド委任はしない。**
各ユーザーが初回に OAuth 連携し、そのトークンで本人として検索する。→ 共有ドライブ権限がそのまま効き、L1〜L4制御が自動成立。

## 4. コスト最適化の実装ポイント（`COST_DESIGN` の反映）

- 段階型：検索はGoogle API（LLMトークン非消費）→ 上位ヒットの抜粋のみLLMへ → 精読は上位2〜5件
- モデルルーティング：`bot/src/brain/routing.ts`（Haiku/Sonnet/Opus）
- プロンプトキャッシュ：システムプロンプト＋用語集＋組織図を先頭固定・`cache_control` 付与（`agent.ts`）
- 1質問あたり入力上限ガード（既定10万トークン）＋ユーザー別トークン集計（`qaLog.ts`）
- 夜間バッチ（顧客サマリー生成・Batch API）は Phase 2 後半で `batch/` に追加予定

## 5. 実装ステップ（スプリント）

1. **S1 スケルトン起動**（本コミット）：Express + Chat webhook + JWT検証 + モックエージェントでローカル起動・単体テスト
2. **S2 エージェント実装**：Anthropic tool-use ループ、Drive検索ツールを実データで接続、出典整形
3. **S3 OAuth**：ユーザーOAuthフロー＋トークン保存（Firestore）＋リフレッシュ、Gmail本人検索
4. **S4 非同期応答**：受付即応 → Cloud Tasks/バックグラウンドで実行 → Chat REST で追記投稿
5. **S5 ログ/評価**：QAログ・未回答記録、ゴールデンセットでの回帰評価スクリプト
6. **S6 デプロイ**：Dockerfile・Cloud Run・Secret Manager 連携、Chatアプリ本登録、限定公開で試用

## 6. 受け入れ基準（Phase 2 完了の定義）

- [ ] 全社員がGoogle Chatで `@頭脳` に質問でき、出典リンク付きで回答が返る
- [ ] 他人のメール・権限外ドライブが**技術的に**検索されないことを確認（別ユーザーで検証）
- [ ] 受付応答3秒以内 / 通常回答60秒以内（`REQUIREMENTS` NFR-1）
- [ ] ゴールデンセット50問で回答成功率80%以上（`REQUIREMENTS` FR-4.2）
- [ ] 全質問・回答・参照ページがログに記録され、L3以上参照時にアラート（`ACCESS_CONTROL` §6）

## 7. 未決・要確認（実装を止めない前提の仮定つき）

| # | 事項 | 現時点の仮定（進める） |
|---|---|---|
| 1 | トークン保存先 | Firestore（Cloud Run から最小権限で読み書き）を採用 |
| 2 | 非同期実行基盤 | まず同一プロセス内バックグラウンド、負荷が出たら Cloud Tasks |
| 3 | 使用モデルID | Haiku=`claude-haiku-4-5-20251001` / Sonnet=`claude-sonnet-4-6` / Opus=`claude-opus-4-8`（`routing.ts` で一元管理・変更容易） |
| 4 | 管理者 | 1名（コネクタ・プロンプト・ボット保守）※要指名 |
| 5 | 月次予算上限 | アラートは80%到達で通知。上限額は試用実測後に確定 |
