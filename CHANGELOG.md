# [1.1.0](https://github.com/ishii-code/dgloss-os2.0/compare/v1.0.0...v1.1.0) (2026-07-14)


### Features

* **eval:** ゴールデンセット回帰評価ハーネスを追加 (S5) ([1c6ca37](https://github.com/ishii-code/dgloss-os2.0/commit/1c6ca371b1f93c04a1dfbab95cc1a94857100a84))

# 1.0.0 (2026-07-14)


* refactor!: デプロイ基盤をVercel+Supabaseへ統一しdgloss標準に整合 ([41dfb87](https://github.com/ishii-code/dgloss-os2.0/commit/41dfb87014c15e977aa573442f63b70a0e57cedc))


### BREAKING CHANGES

* Cloud Run/KMS/Firestore/Cloud Tasks を廃止し Vercel+Supabase に変更。

dgloss標準(ARCHITECTURE/RELEASE/TECH_STACK)に合わせて再アライメント。
- compute: Cloud Run→Vercel Functions(api/index.ts+vercel.json、Express appを関数化)
- トークン保管: Firestore→Supabase Postgres(oauth_tokens・RLS)。暗号化はアプリ層エンベロープ(AES-256-GCM)、KEKはVercel環境変数(将来Supabase Vault)
- 鍵管理: Cloud KMS→env KEK(keyManager刷新)
- 非同期: Cloud Tasks→Vercel waitUntil(chat/dispatch刷新、/tasks/answer撤去)
- Node 20→22、GCP依存(kms/firestore/tasks)削除、@supabase/@vercel追加
- リリース自動化: .releaserc.json + release.yml(semantic-release)追加、以後Conventional Commits
- docs: SETUP(Vercel+Supabase+GCP-API)/IMPLEMENTATION/README を改訂。GCPはChat/Drive/Gmail APIとOAuthのみ
- typecheck 0 / スモーク(暗号化往復+失効+マスク+非同期+同期)成功

Refs: SECURITY T1
Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
