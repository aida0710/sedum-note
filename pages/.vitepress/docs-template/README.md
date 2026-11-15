# ドキュメントのサイトのテンプレート

自作アプリ（Sedum Note・sshc など）のドキュメントのサイトを、同じ作りにするためのテンプレートです。VitePress 1.6 の既定のテーマの上に、トップのページ・角の丸め・表・書体・日本語の表示をそろえます。製品ごとに変えるのは、色と中身（名前・リンク・目次・トップの文と画像）だけです。

mado family の製品のドキュメントは、mado のデザインシステムの `docs.css` を使います。このテンプレートは使いません。

## 製品の側に置くもの

```
pages/
  index.md                    # トップの中身（frontmatter の docsHome）と <DocsHome />
  .vitepress/
    config.ts                 # export default defineDocsConfig({ ... })
    theme/
      index.ts                # docs-template/theme を読み、colors.css を読む
      colors.css              # 製品の色だけ
    docs-template/            # このフォルダ（製品の側では書き換えない）
```

`package.json` には `vitepress` と `@fontsource-variable/noto-sans-jp` を入れます。

### config.ts

```ts
import { defineDocsConfig } from "./docs-template/config";

export default defineDocsConfig({
  name: "製品の名前",
  description: "検索結果と SNS に出す説明",
  repository: "https://github.com/<持ち主>/<リポジトリ>",
  base: "/<リポジトリ>/",
  siteUrl: "https://<持ち主>.github.io/<リポジトリ>/",
  ogImage: "/images/<画面>.webp",
  logo: "/logo.svg",
  favicon: { path: "/logo.svg", type: "image/svg+xml" },
  themeColor: "#<製品の色>",
  nav: [/* 上部のバーのリンク */],
  sidebar: [/* 左の目次 */],
  footer: { message: "<ライセンス>", copyright: "Copyright © <名前>" },
  // 英語版があれば /en/ に置く: english: { description, nav, sidebar },
  // 製品だけの Markdown の書き方（図など）があれば: markdown: (md) => { ... },
});
```

ページの編集のリンクはリポジトリの `main` の `pages/` を指します。

### theme/index.ts と colors.css

```ts
import docsTheme from "../docs-template/theme";
import "./colors.css";

export default docsTheme;
```

製品だけの部品があるときは、`{ extends: docsTheme, enhanceApp({ app }) { app.component(...) } }` の形で足します。

`colors.css` には色だけを書きます。ライトは `:root`、ダークは `.dark` に書きます。

- VitePress の色: `--vp-c-brand-1`〜`3`、`--vp-c-brand-soft`、`--vp-c-bg`・`-alt`・`-elv`・`-soft`、`--vp-c-text-1`〜`3`、`--vp-c-divider`、`--vp-c-border`、`--vp-code-block-bg`
- ボタンの色: `--vp-button-brand-*`（トップのいちばん勧めるボタン）、`--vp-button-alt-*`（ほかのボタン）
- テンプレートの色: `--docs-frame-bg`・`--docs-frame-border`・`--docs-frame-dot`（トップの画面の画像を囲む窓の枠）、`--docs-command-bg`・`--docs-command-text`・`--docs-command-muted`（トップのコマンドの箱）

角の丸め・余白・文字の大きさ・書体は、製品の側で変えません。

### index.md

```md
---
layout: home
title: 製品の名前
description: 説明
sidebar: false
outline: false
docsHome:
  name: 製品の名前
  lead: 1〜2 文の紹介（HTML）
  platforms: { label: 対応OS, text: macOS / Windows / Linux }
  actions:
    - { text: インストール, link: /guide/install, primary: true }
    - { text: GitHub, link: "https://github.com/<持ち主>/<リポジトリ>" }
  preview: { src: /images/<画面>.webp, alt: 画像の説明, width: 1280, height: 800 }
  sections:
    - heading: 主な機能
      lead: 節の紹介（HTML）
      features:
        - { title: 機能の名前, link: /features/x, image: /images/x.webp, alt: 画像の説明, body: 説明（HTML）, wide: true }
    - heading: ほかにできること
      links: ['<a href="./features/y">機能</a>の短い説明']
    - heading: インストール
      command: { code: brew install <名前>, label: macOS / Linux }
---

<DocsHome />
```

節には機能のカード（`features`）・短い項目の一覧（`links`）・コマンド（`command`）・ボタン（`actions`）を、要るものだけ書きます。形は `homeContent.ts` にあります。機能のカードには、番号と、16:9 に切った画像が付きます。先頭の 2 枚を `wide: true` にすると、1 行に 2 枚並びます。

## 角の丸め

角の丸めは 2 段だけです。

- `--docs-radius`（8px）: 表・コード・注記・本文の画像・カード・ボタン・検索・メニューなどの箱
- `--docs-radius-inline`（4px）: 行の中のコード・キー・バッジ・コピーのボタン・メニューの行など、文や箱の中の小さな部品

VitePress の既定の部品の角（2〜24px）も、この 2 段に置き換えています。新しい部品を足すときも、どちらかを使います。
