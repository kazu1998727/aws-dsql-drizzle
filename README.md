# Aurora DSQL × Drizzle ORM サンプル

[Drizzle ORM](https://orm.drizzle.team/) から [Amazon Aurora DSQL](https://docs.aws.amazon.com/aurora-dsql/latest/userguide/what-is-aurora-dsql.html) を利用するサンプルです。型安全なクエリ、DSQL 対応のマイグレーション、動作確認用の管理画面を含みます。

AWS Database Blog の [Building type-safe applications with Drizzle ORM in Aurora DSQL](https://aws.amazon.com/jp/blogs/database/building-type-safe-applications-with-drizzle-orm-in-aurora-dsql/) を参考にしています。

## 前提条件

- 既定の認証情報が設定済みの AWS アカウント（[設定ガイド](https://docs.aws.amazon.com/credref/latest/refdocs/creds-config-files.html)）
- [Node.js 20 以上](https://nodejs.org)
- Aurora DSQL クラスタ（[入門ガイド](https://docs.aws.amazon.com/aurora-dsql/latest/userguide/getting-started.html)）

## クイックスタート

```bash
npm install

cp .env.example .env      # クラスタのエンドポイントを記入する
npm run sample            # マイグレーション適用 + サンプル実行
```

管理画面を使う場合は、ターミナルを 2 つ用意します。

```bash
npm run api               # CRUD API      http://localhost:3000
npm run web               # 管理画面      http://localhost:5173
```

## ドキュメント

| ドキュメント                                               | 内容                                                         |
| ---------------------------------------------------------- | ------------------------------------------------------------ |
| [docs/setup.md](docs/setup.md)                             | 環境変数、マイグレーション、起動手順、トラブルシューティング |
| [docs/architecture.md](docs/architecture.md)               | 全体構成、モジュール責務、リクエストの流れ                   |
| [docs/api.md](docs/api.md)                                 | 管理画面用 CRUD API の仕様                                   |
| [docs/aurora-dsql-drizzle.md](docs/aurora-dsql-drizzle.md) | Aurora DSQL 固有の制約と Drizzle での対処                    |

## スクリプト

| コマンド                   | 説明                                                       |
| -------------------------- | ---------------------------------------------------------- |
| `npm run sample`           | マイグレーションを適用し、サンプルコードを実行する         |
| `npm run api`              | 管理画面用の CRUD API を起動する（既定 3000 番）           |
| `npm run web`              | Vite 開発サーバーで管理画面を起動する（既定 5173 番）      |
| `npm run migrate:generate` | スキーマから SQL マイグレーションを生成する（DB 接続不要） |
| `npm run build`            | TypeScript をビルドする                                    |
| `npm test`                 | 結合テストを実行する（クラスタが必要）                     |
| `npm run format`           | Prettier で整形する                                        |

## ディレクトリ構成

```
src/
  schema.ts       Drizzle スキーマ定義（テーブルとリレーション）
  dsql-client.ts  IAM 認証付きの接続プールと Drizzle クライアント生成
  migrate.ts      DSQL 対応の自前マイグレーションランナー
  example.ts      CRUD とリレーションのサンプルコード
  index.ts        サンプルのエントリポイント
  server.ts       管理画面用 CRUD API
  utils.ts        環境変数の取得
web/              管理画面（React + Vite）
drizzle/          生成された SQL マイグレーション
test/             結合テスト
docs/             ドキュメント
```

## クリーンアップ

テーブルを削除するには、クラスタに接続して以下を実行します。

```sql
DROP TABLE IF EXISTS "__drizzle_migrations";
DROP TABLE IF EXISTS "_SpecialtyToVet";
DROP TABLE IF EXISTS "pet";
DROP TABLE IF EXISTS "owner";
DROP TABLE IF EXISTS "specialty";
DROP TABLE IF EXISTS "vet";
```

## 参考リンク

- [Amazon Aurora DSQL ドキュメント](https://docs.aws.amazon.com/aurora-dsql/latest/userguide/what-is-aurora-dsql.html)
- [Aurora DSQL のシーケンスと ID 列](https://docs.aws.amazon.com/aurora-dsql/latest/userguide/sequences-identity-columns.html)
- [PostgreSQL から Aurora DSQL への移行ガイド](https://docs.aws.amazon.com/aurora-dsql/latest/userguide/working-with-postgresql-compatibility-migration-guide.html)
- [Aurora DSQL Node.js Connector](https://github.com/awslabs/aurora-dsql-connectors/tree/main/node)
- [Drizzle ORM ドキュメント](https://orm.drizzle.team/docs/overview)

---

Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.

SPDX-License-Identifier: MIT-0
