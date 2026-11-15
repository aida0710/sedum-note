import { defineDocsConfig } from "./docs-template/config";

const repository = "https://github.com/aida0710/sedum-note";
// Web 版のアプリが GitHub Pages の /sedum-note/ にあるので、ドキュメントはその下の /sedum-note/docs/ に置く。
// 手元で確かめるときは SEDUM_NOTE_DOCS_BASE=/ で組み立てる。
const base = process.env.SEDUM_NOTE_DOCS_BASE ?? "/sedum-note/docs/";
const siteUrl = "https://aida0710.github.io/sedum-note/docs/";
const webAppUrl = "https://aida0710.github.io/sedum-note/";
const description = "エンドツーエンド暗号化（E2EE）のメモアプリ。S3互換ストレージかWebDAVで同期し、Windows・macOS・Linux・Android・Webで使えます。";

const sidebar = [
  { text: "はじめる", items: [
    { text: "Sedum Noteとは", link: "/guide/introduction" },
    { text: "インストール", link: "/guide/install" },
    { text: "最初の設定", link: "/guide/first-steps" },
  ] },
  { text: "書く", items: [
    { text: "エディタの基本", link: "/editor/basics" },
    { text: "表", link: "/editor/tables" },
    { text: "ブロックの種類", link: "/editor/blocks" },
    { text: "リンクと埋め込み", link: "/editor/links" },
    { text: "画像・ファイル・録音", link: "/editor/attachments" },
    { text: "折りたたみとズーム", link: "/editor/outline" },
    { text: "テンプレート", link: "/editor/templates" },
  ] },
  { text: "整理する", items: [
    { text: "ノートブックとタグ", link: "/organize/notebooks" },
    { text: "プロパティとデータベース表示", link: "/organize/database" },
    { text: "検索とコマンドパレット", link: "/organize/search" },
    { text: "タブとウィンドウ", link: "/organize/workspace" },
    { text: "期限と通知", link: "/organize/reminders" },
    { text: "履歴とゴミ箱", link: "/organize/history-trash" },
    { text: "スペース", link: "/organize/spaces" },
  ] },
  { text: "同期とデータ", items: [
    { text: "同期を設定する", link: "/sync/setup" },
    { text: "同期先の準備", link: "/sync/storage" },
    { text: "バックアップとエクスポート", link: "/sync/backup-export" },
  ] },
  { text: "セキュリティ", items: [
    { text: "ロックとパスフレーズ", link: "/security/lock" },
    { text: "暗号化のしくみ", link: "/security/encryption" },
  ] },
  { text: "AI", items: [
    { text: "AIチャット", link: "/ai/chat" },
    { text: "MCPサーバー", link: "/ai/mcp" },
  ] },
  { text: "カスタマイズ", items: [
    { text: "テーマと表示", link: "/customize/appearance" },
    { text: "キーボードショートカット", link: "/customize/shortcuts" },
    { text: "プラグイン", link: "/customize/plugins" },
  ] },
  { text: "プラットフォーム", items: [
    { text: "スマホとAndroid", link: "/platform/mobile" },
    { text: "Web版", link: "/platform/web" },
  ] },
  { text: "リファレンス", items: [
    { text: "Markdownとの対応", link: "/reference/markdown" },
    { text: "アプリの更新", link: "/reference/updates" },
    { text: "トラブルシューティング", link: "/reference/troubleshooting" },
  ] },
];

export default defineDocsConfig({
  name: "Sedum Note",
  description,
  repository,
  base,
  siteUrl,
  ogImage: "/images/workspace.webp",
  logo: "/app-icon.png",
  favicon: { path: "/app-icon.png", type: "image/png" },
  themeColor: "#2f7d54",
  nav: [
    { text: "はじめる", link: "/guide/introduction" },
    { text: "機能", link: "/editor/basics" },
    { text: "Web版", link: webAppUrl },
    { text: "ダウンロード", link: `${repository}/releases/latest` },
  ],
  sidebar,
  footer: {
    message: "Apache License 2.0",
    copyright: "Copyright © aida0710",
  },
});
