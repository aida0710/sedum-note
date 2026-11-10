# Sedum Note

S3 互換のストレージで同期する、エンドツーエンド暗号化（E2EE）のメモ帳です。Windows・macOS・Linux・Android のアプリ（Tauri）と、ブラウザで動く [Web 版](https://aida0710.github.io/sedum-note/)があります。アプリは [CI](https://github.com/aida0710/sedum-note/actions/workflows/ci.yml) の成果物から入れられます。

- メモ・ノートブック・写真は、このデバイスで暗号化してからストレージへ送ります。ストレージに置かれるのは暗号文とランダムな ID だけで、タイトルやノートブックの名前も見えません。
- オフラインでも書けます。つながったら、編集の 2 秒後と 60 秒おきに同期します。
- 2 台で同じメモを同時に変えても、両方の変更が 1 つのメモにマージされます（本文は Yjs。タイトルやピン留めなどは、あとに変えた方が残ります）。
- 同期しなくても使えます。同期は、あとから「設定」で足せます。

## 同期先の用意

S3 互換で、条件付き書き込み（`If-Match`・`If-None-Match`）を守るストレージを使います。アプリはつなぐときにこれを確かめ、守らないストレージには同期先として設定させません。アプリはストレージへ直接つなぐので、バケットに CORS の設定が要ります。

```json
[
  {
    "AllowedOrigins": ["http://tauri.localhost", "tauri://localhost"],
    "AllowedMethods": ["GET", "PUT", "HEAD", "DELETE"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

Web 版を使うときは、`https://aida0710.github.io` も `AllowedOrigins` に足してください。アプリの「設定」に、開いている画面の origin を入れた例が出ます。

## 暗号化の形

パスフレーズから Argon2id（64 MiB、3 回）でキーを作り、ランダムなマスターキー（AES-256）を包んで `vault.json` に置きます。メモと添付は 1 件ごとに AES-256-GCM で暗号化し、記録の ID を追加認証データに入れます。そのため、ストレージの上で暗号文を別の ID へ入れ替えても開けません。同期先の認証情報も、マスターキーで暗号化して手元に保存します。

ストレージには次のものを置きます。

| キー | 中身 |
|---|---|
| `<フォルダ>/vault.json` | 包んだマスターキーと Argon2id の値 |
| `<フォルダ>/records/<id>` | メモ・ノートブック 1 件の暗号文 |
| `<フォルダ>/blobs/<id>` | 写真など 1 件の暗号文 |

## 開発

Node.js 22 と npm 11、Rust（stable）が必要です。

```sh
npm ci
npm run dev            # ブラウザで画面を開く
npm test               # 単体試験
integration/s3-up.sh   # 試験用の S3 互換サーバー（SeaweedFS、127.0.0.1:18333）
npm run test:integration
npm run e2e            # 2 台のブラウザで同期する画面の試験
npx tauri dev          # デスクトップのアプリ
npx tauri android dev  # Android（Android SDK・NDK と JDK 21 が必要）
```

## License

[Apache License 2.0](LICENSE)
