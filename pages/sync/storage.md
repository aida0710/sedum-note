---
title: 同期先の準備
description: AWS S3・Cloudflare R2・セルフホストのS3互換ストレージとWebDAVサーバーの設定、Web版で要るCORSの設定。
---

# 同期先の準備

同期先にはS3互換ストレージかWebDAVサーバーを使います。どちらも、条件付き書き込み（`If-Match`・`If-None-Match`）に対応していることが条件です。アプリは「接続を確認」でこれを確かめ、対応していない同期先は使わせません。2台が同時に書き込んでも、変更が失われないようにするためです。

## S3互換ストレージ

サービスは問いません。AWS S3、Cloudflare R2、セルフホストのMinIOやSeaweedFSなどを使えます。

| ストレージ | エンドポイント | リージョン |
| --- | --- | --- |
| AWS S3 | `https://s3.<リージョン>.amazonaws.com` | バケットのリージョン（例: `ap-northeast-1`） |
| Cloudflare R2 | `https://<アカウントID>.r2.cloudflarestorage.com` | `auto` |
| セルフホストのサーバー | そのサーバーのURL（`https://`） | サーバーの設定に合わせる |

- エンドポイントは`https://`で始めます。バケット名はエンドポイントに含めず、「バケット」の欄に入力します。
- 「フォルダ」にはバケット内の保存場所を入力します。使える文字は英数字と「.」「_」「-」「/」です。
- 同期まで確かめているのは、Cloudflare R2とSeaweedFSです。

アクセスキーにはそのバケットの読み取り・書き込み・削除・一覧の権限を付けます。

## WebDAVサーバー

「同期先の種類」で「WebDAV」を選び、メモを保存するフォルダのURLと、ユーザー名・パスワードを入力します。

- フォルダが無ければ作成します。親のフォルダは先に作っておいてください。
- サーバーでアプリパスワードを発行できる場合は、それを使ってください。
- 書き込みの応答にETagを返さないサーバーでは、書き込んだ直後に読み直して確かめます。
- 同期まで確かめているのは、Apache（mod_dav）とNextcloudです。

## Web版で同期するとき（CORS）

PCとAndroidのアプリは、バケットとアクセスキーを作るだけで同期できます。Web版はブラウザから同期先へ直接接続するので、同期先にCORSの設定が要ります。

S3互換ストレージには次の設定を追加します。この設定はWeb版の最初の画面と「設定」の「同期」ページの「バケットのCORS設定」にも出ます。

```json
[
  {
    "AllowedOrigins": ["https://aida0710.github.io"],
    "AllowedMethods": ["GET", "PUT", "HEAD", "DELETE"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

WebDAVサーバーでは、Web版のoriginからの要求（`PROPFIND`・`MKCOL`・`PUT`・`DELETE`と、`If-Match`・`If-None-Match`・`Depth`・`Authorization`のヘッダー）を許可し、`ETag`を公開するCORSの設定をサーバー側に入れます。
