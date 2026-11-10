# 本物の S3 互換サーバーでの試験

SeaweedFS をこのマシンの中（`127.0.0.1:18333`）だけで動かし、条件付き PUT・一覧・
CORS を含めて同期を確かめます。認証情報は試験用の固定値です。

```sh
integration/s3-up.sh
npm run test:integration
integration/s3-down.sh
```
