# 本物の S3 互換サーバーでの試験

SeaweedFS をこのマシンの中（`127.0.0.1:18333`）だけで動かし、条件付き PUT・一覧・
CORS を含めて同期を確かめます。認証情報は試験用の固定値です。

```sh
integration/s3-up.sh
integration/webdav-up.sh
npm run test:integration
integration/s3-down.sh
integration/webdav-down.sh
```

WebDAV の試験は、Apache（mod_dav）をこのマシンの中（`127.0.0.1:18480`）だけで動かして流します。ほかの WebDAV のサーバーを
相手に流すときは、環境変数 `WEBDAV_TEST_URL`（試験用のフォルダを作ってよい、フォルダの URL）・`WEBDAV_TEST_USERNAME`・
`WEBDAV_TEST_PASSWORD` を渡します。試験は `run-<乱数>` のフォルダに書くので、終わったら消します。
