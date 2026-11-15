# 開発

Node.js 22とnpm 11、Rust（stable）が必要です。

```sh
npm ci
npm run dev            # ブラウザで画面を開く
npm test               # 単体テスト
integration/s3-up.sh   # テスト用のS3互換サーバー（SeaweedFS、127.0.0.1:18333）
integration/webdav-up.sh  # テスト用のWebDAVサーバー（Apache、127.0.0.1:18480）
npm run test:integration
npm run e2e            # ブラウザでの画面のテスト（2台の同期を含む）
npx tauri dev          # デスクトップのアプリ
npx tauri android dev  # Android（Android SDK・NDKとJDK 21が必要）
```

## Linuxのアプリを組み立てる

アプリのRust側を変えたときは、`scripts/app-checks/linux/build-app.sh`で、LinuxのアプリをDockerのコンテナの中で組み立てられます。WebKitGTKの開発用パッケージを手元に入れずに済みます。

## データの形のバージョン

エディタに書式（ノードやマーク）を足したときや、記録の書き方を変えたときは、`src/core/format/dataFormat.ts`の`DATA_FORMAT_VERSION`を1つ上げます。足す前のアプリがその書式を本文から消さないようにするためです。手元の記録を新しい形にする手順が要るときの決まりは、[data-format.md](data-format.md)にあります。

## ドキュメントのサイト

利用者向けのドキュメントは`pages/`にあります（VitePress）。GitHub Pagesの`https://aida0710.github.io/sedum-note/docs/`に、Web版のアプリと一緒に置きます。

```sh
cd pages
npm ci
npm run dev            # http://127.0.0.1:5173/sedum-note/docs/
npm run build          # リンク切れがあると失敗する
```

見た目は、sshc と同じ作りにする共通のテーマ（[aida0710/app-docs-theme](https://github.com/aida0710/app-docs-theme)）が持ちます。テーマは GitHub Release の tarball を`pages/package.json`で読みます。Sedum Note の側で決めるのは、色（`pages/.vitepress/theme/colors.css`）と、トップの中身（`pages/index.md`の frontmatter）と、目次（`pages/.vitepress/config.ts`）だけです。使い方はテーマの README にあります。テーマを新しいバージョンにするときは、`pages/package.json`の tarball の URL を書き換えます。

ドキュメントの画像（`pages/public/images/`）は、`scripts/docs-images/captureDocsImages.mjs`で撮り直します。見本のデータは`scripts/docs-images/docsSampleNotes.mjs`にあり、架空の内容だけを入れます。画面を変えたら撮り直してください。

```sh
integration/s3-up.sh
npx vite --host 127.0.0.1 --port 5390
BASE_URL=http://127.0.0.1:5390/ node scripts/docs-images/captureDocsImages.mjs
```

## リリース

`docs/releases/<タグ>.md`を置いて`v0.2.0`の形のタグをpushすると、CIがインストーラーと、アプリの更新用の`latest.json`をGitHub Releasesに置きます。同じタグのWeb版の画面とドキュメントを、GitHub Pagesに置きます。CIはLinuxで、古いバージョンから組み立てたAppImageへ実際に更新する予行もします。

mainへのpushで`pages/`が変わったときは、CIが最新のリリースのタグのWeb版と、mainのドキュメントを組み立てて、GitHub Pagesに置き直します。Web版がリリースの前の画面に変わることはありません。

## ライセンスの一覧

アプリに入れている、ほかの人が作ったソフトウェアのライセンスの一覧は`npm run licenses`で作ります。依存を足したり、バージョンを上げたりしたら流し直します。流し忘れは単体テストが見つけます。
