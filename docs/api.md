# CRUD API 仕様

管理画面から使う JSON API です。`npm run api` で起動し、既定では `http://localhost:3000` を待ち受けます。

> 認証はありません。全テーブルへの読み書きを公開するため、ローカル開発専用です。

実装は [src/server.ts](../src/server.ts) の 1 ファイルです。テーブルごとの個別ハンドラではなく、レジストリを引く汎用ハンドラになっています。

## 対象テーブル

| テーブル    | 主キー           | 参照列              |
| ----------- | ---------------- | ------------------- |
| `owner`     | `id` (uuid)      | —                   |
| `pet`       | `id` (uuid)      | `ownerId` → `owner` |
| `vet`       | `id` (uuid)      | —                   |
| `specialty` | `name` (varchar) | —                   |

`_SpecialtyToVet` は複合主キーのため対象外です（[architecture.md](architecture.md#複合主キーのテーブルを対象外にした理由)）。

## エンドポイント

| メソッド | パス              | 説明                 |
| -------- | ----------------- | -------------------- |
| `GET`    | `/api/tables`     | 対象テーブル名の一覧 |
| `GET`    | `/api/:table`     | 全行と列メタ情報     |
| `POST`   | `/api/:table`     | 1 行作成             |
| `PUT`    | `/api/:table/:id` | 主キー指定で更新     |
| `DELETE` | `/api/:table/:id` | 主キー指定で削除     |

### `GET /api/tables`

```bash
curl http://localhost:3000/api/tables
```

```json
{ "tables": ["owner", "pet", "vet", "specialty"] }
```

### `GET /api/:table`

行だけでなく、画面を組み立てるためのメタ情報を返します。

```bash
curl http://localhost:3000/api/pet
```

```json
{
    "pk": "id",
    "refs": { "ownerId": "owner" },
    "columns": ["id", "name", "birthDate", "ownerId"],
    "rows": [
        {
            "id": "e7ccb058-9b0c-4d11-9bf6-3e57a2885d5d",
            "name": "tama",
            "birthDate": "2021-03-03T00:00:00.000Z",
            "ownerId": "7551bdbd-1ebe-4c6f-9717-2f42c47a1896"
        }
    ]
}
```

| フィールド | 内容                                                        |
| ---------- | ----------------------------------------------------------- |
| `pk`       | 主キーの列名。`PUT` / `DELETE` の `:id` に使う値の列        |
| `refs`     | 参照列 → 参照先テーブル名。画面はこれを見てプルダウンを出す |
| `columns`  | 列名の一覧。行が 0 件でも列が分かる                         |
| `rows`     | 全行。ページネーションなし                                  |

### `POST /api/:table`

```bash
curl -X POST http://localhost:3000/api/owner \
  -H 'content-type: application/json' \
  -d '{"name":"山田","city":"Tokyo"}'
```

```json
{
    "id": "7551bdbd-1ebe-4c6f-9717-2f42c47a1896",
    "name": "山田",
    "city": "Tokyo",
    "telephone": null
}
```

主キーは省略できます。`uuid` 列は `gen_random_uuid()` の既定値で採番されます。

### `PUT /api/:table/:id`

送った列だけを更新します。主キーは変更できません（リクエストに含まれていても無視されます）。

```bash
curl -X PUT http://localhost:3000/api/owner/7551bdbd-... \
  -H 'content-type: application/json' \
  -d '{"city":"Osaka"}'
```

更新後の行を返します。該当行がなければ `404` です。

### `DELETE /api/:table/:id`

```bash
curl -X DELETE http://localhost:3000/api/owner/7551bdbd-...
```

```json
{ "deleted": 1 }
```

## リクエストボディの扱い

`POST` / `PUT` のボディは、スキーマ定義に基づいて次のように処理されます（`toRow()`）。

1. **未知の列は捨てる** — スキーマに存在しない列名はクエリに渡しません。
2. **空文字は `null` にする** — 画面の空欄と DB の `NULL` を対応付けます。参照列を `""` で送ると関連を外せます。
3. **日付列は `Date` に変換する** — `date` 型の列は `"2021-03-03"` のような文字列を受け付けます。解釈できない値は `400` を返します。

```bash
# ownerId を空文字で送ると関連が外れる
curl -X PUT http://localhost:3000/api/pet/e7ccb058-... \
  -H 'content-type: application/json' -d '{"ownerId":""}'
# → { ..., "ownerId": null }
```

## 必須列

API は NOT NULL 制約を事前に検査しません。必須列が欠けた状態で `POST` すると、DB のエラーがそのまま返ります。

| テーブル    | 必須列              |
| ----------- | ------------------- |
| `owner`     | `name`, `city`      |
| `pet`       | `name`, `birthDate` |
| `vet`       | `name`              |
| `specialty` | `name`              |

```json
{
    "error": "Failed query: insert into \"owner\" ... -> null value in column \"city\" of relation \"owner\" violates not-null constraint"
}
```

管理画面も必須列を示さないため、`city` などを空欄のまま追加するとこのエラーになります。改善余地として [architecture.md](architecture.md#既知の制約) に記載しています。

## エラーレスポンス

エラーは常に `{ "error": "..." }` の形で返ります。

| ステータス | 発生条件                                                            |
| ---------- | ------------------------------------------------------------------- |
| `400`      | JSON が不正 / 日付が不正 / パスに `:id` がない / 更新対象の列がない |
| `404`      | 未知のテーブル名 / 該当する行がない / パスが `/api/...` でない      |
| `405`      | `GET` `POST` `PUT` `DELETE` 以外のメソッド                          |
| `500`      | DB 側のエラー（接続失敗、制約違反、テーブル不存在など）             |

`500` の場合、メッセージは原因チェーンを `->` で連結した形になります。右端が実際の原因です。

```
Failed query: select "id", "name" from "owner" -> relation "owner" does not exist
```

## 動作確認例

```bash
B=http://localhost:3000/api

# 作成して id を取り出す
OID=$(curl -s -X POST $B/owner -H 'content-type: application/json' \
  -d '{"name":"山田","city":"Tokyo"}' | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).id')

# 関連付けて pet を作成
curl -s -X POST $B/pet -H 'content-type: application/json' \
  -d "{\"name\":\"tama\",\"birthDate\":\"2021-03-03\",\"ownerId\":\"$OID\"}"

# 更新
curl -s -X PUT $B/owner/$OID -H 'content-type: application/json' -d '{"city":"Osaka"}'

# 削除
curl -s -X DELETE $B/owner/$OID
```

## テーブルを追加するには

[src/server.ts](../src/server.ts) の `TABLES` に 1 行足します。単一列の主キーであれば、他の変更は不要です。

```typescript
const TABLES = {
    // ...
    visit: { table: schema.visit, pk: "id", refs: { petId: "pet" } },
};
```
