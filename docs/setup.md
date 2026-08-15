# 構築手順

セットアップから管理画面の起動までの手順です。

## 1. 前提条件

| 項目                 | 要件                                          | 確認コマンド                  |
| -------------------- | --------------------------------------------- | ----------------------------- |
| Node.js              | 20 以上（`package.json` の `engines` で指定） | `node -v`                     |
| AWS 認証情報         | 既定プロファイルまたは `AWS_PROFILE`          | `aws sts get-caller-identity` |
| Aurora DSQL クラスタ | 作成済みでエンドポイントが分かること          | AWS マネジメントコンソール    |

Aurora DSQL の認証は IAM トークンで行われるため、パスワードの設定・保管は不要です。上記の `aws sts get-caller-identity` が成功する状態であれば、そのまま接続できます。

## 2. 依存関係のインストール

```bash
npm install
```

## 3. 環境変数の設定

必要な変数は 2 つだけです。

| 変数               | 必須 | 説明                                                            |
| ------------------ | ---- | --------------------------------------------------------------- |
| `CLUSTER_ENDPOINT` | 必須 | クラスタのエンドポイント（例: `abcdefg.dsql.us-east-1.on.aws`） |
| `CLUSTER_USER`     | 必須 | 接続ユーザー。`admin` かそれ以外かでスキーマが変わる（後述）    |
| `PORT`             | 任意 | CRUD API の待ち受けポート。既定は `3000`                        |

### `.env` を使う方法（推奨）

```bash
cp .env.example .env
```

`.env` にクラスタの値を記入します。

```
CLUSTER_ENDPOINT=abcdefg.dsql.us-east-1.on.aws
CLUSTER_USER=admin
```

`npm run sample` と `npm run api` は Node.js 標準の `--env-file-if-exists=.env` で `.env` を読み込みます。dotenv などのパッケージは不要です。ファイルが存在しなくてもエラーにはなりません。

> `.env` は `.gitignore` 済みです。実際のエンドポイントは `.env.example`（コミット対象のテンプレート）ではなく `.env` に書いてください。

### シェルの環境変数を使う方法

```bash
export CLUSTER_ENDPOINT="abcdefg.dsql.us-east-1.on.aws"
export CLUSTER_USER="admin"
```

シェルの環境変数は `.env` より優先されます。設定内容の確認は次のコマンドで行えます。

```bash
printenv | grep -E '^(CLUSTER_ENDPOINT|CLUSTER_USER)='
```

`echo $CLUSTER_ENDPOINT` は未設定でも空行を出力するだけなので、`printenv` のほうが判別が確実です。

### リージョンについて

コネクタがホスト名からリージョンを自動判別するため、`AWS_REGION` の設定は不要です。

## 4. マイグレーションの適用

`npm run sample` が起動時に未適用のマイグレーションを自動で適用します。初回はこのコマンドを一度実行してテーブルを作成してください。

```bash
npm run sample
```

スキーマ (`src/schema.ts`) を変更した場合は、SQL を再生成します。生成のみであれば DB 接続は不要です。

```bash
npm run migrate:generate
```

生成された SQL は `drizzle/` に出力され、`drizzle/meta/_journal.json` に登録されます。適用状況は DB 側の `__drizzle_migrations` テーブルで管理されます。詳細は [aurora-dsql-drizzle.md](aurora-dsql-drizzle.md#マイグレーション) を参照してください。

> `npm run api` はマイグレーションを適用しません。管理画面だけを使う場合も、初回は `npm run sample` を実行してテーブルを作成しておく必要があります。

## 5. 管理画面の起動

ターミナルを 2 つ使います。

```bash
npm run api    # CRUD API      http://localhost:3000
```

```bash
npm run web    # 管理画面      http://localhost:5173
```

ブラウザで `http://localhost:5173` を開きます。Vite 開発サーバーが `/api` へのリクエストを `http://localhost:3000` にプロキシします（[vite.config.mts](../vite.config.mts)）。

> API には認証がなく、全テーブルへの読み書きを公開します。ローカル開発専用です。

## 6. テスト

```bash
npm test
```

結合テストは実際のクラスタに接続し、`src/example.ts` を実行してデータの作成・検証・削除まで行います。環境変数の設定が必要です。

## トラブルシューティング

### `Missing required environment variable CLUSTER_ENDPOINT`

環境変数が未設定です。`.env` を作成するか `export` してください。`.env` を作ったのに解消しない場合は、値が `.env.example` 側に書かれていないか確認してください。

### 画面に `Failed query: select ... -> ...` と表示される

`->` の右側が実際の原因です。

| 原因側のメッセージ                                             | 対処                                                |
| -------------------------------------------------------------- | --------------------------------------------------- |
| `relation "owner" does not exist`                              | マイグレーション未適用。`npm run sample` を実行する |
| `getaddrinfo ENOTFOUND`                                        | `CLUSTER_ENDPOINT` の値が誤っている                 |
| `null value in column "city" ... violates not-null constraint` | 必須列が未入力。[api.md](api.md#必須列) を参照      |

### `EADDRINUSE: address already in use`

指定ポートを別プロセスが使用しています。使用中のプロセスを確認して停止してください。

```bash
lsof -ti:3000
```

`.env` に `PORT` を設定して別のポートを使うこともできます。ただし Vite のプロキシ先は `vite.config.mts` に 3000 番で固定されているため、変更する場合は両方を合わせてください。

### 画面が `Loading...` のまま止まる

API が起動していない可能性があります。`npm run api` を実行しているターミナルのログを確認してください。
