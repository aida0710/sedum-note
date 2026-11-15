---
layout: home
title: Sedum Note
description: エンドツーエンド暗号化（E2EE）のメモアプリ。S3互換ストレージかWebDAVで同期し、Windows・macOS・Linux・Android・Webで使えます。
sidebar: false
outline: false
docsHome:
  name: Sedum Note
  lead: メモをデバイスの中で暗号化し、自分で用意したS3互換ストレージかWebDAVサーバーで同期するメモアプリです。同期しなくても、オフラインのまま使えます。
  platforms:
    label: 対応
    text: Windows / macOS / Linux / Android / Web
  actions:
    - { text: インストール, link: /guide/install, primary: true }
    - { text: Web版を開く, link: "https://aida0710.github.io/sedum-note/" }
    - { text: はじめる, link: /guide/introduction }
    - { text: GitHub, link: "https://github.com/aida0710/sedum-note" }
  preview:
    src: /images/workspace.webp
    alt: サイドバーにノートブックとメモ、右に設計メモを開いたPCの画面
    width: 2560
    height: 1600
  sections:
    - heading: 主な機能
      lead: 表・数式・図・手書きを入れられるエディタと、ノートブック・タグ・プロパティでの整理、暗号化した同期を1つのアプリで使えます。
      features:
        - title: ブロックエディタ
          link: /editor/basics
          image: /images/editor-slash-menu.webp
          alt: 「/」で開くブロックの種類のメニュー
          body: 「/」から見出し・リスト・表・コード・画像などを入れられます。Markdownを貼り付けると、そのまま書式になります。
          wide: true
        - title: エンドツーエンド暗号化の同期
          link: /sync/setup
          image: /images/setup-sync.webp
          alt: 同期先のエンドポイントとバケットを入力する画面
          body: 暗号化はデバイスの中で行い、同期先にはランダムなIDの暗号文だけを置きます。2台で同時に書いても、両方の変更が残ります。
          wide: true
        - title: 数式・図・手書き
          link: /editor/blocks
          image: /images/editor-math-callout.webp
          alt: 数式とコールアウトを入れたメモ
          body: LaTeXの数式、Mermaidの図、手書きの線、段組み、脚注、コールアウトを本文に入れられます。
        - title: リンクとバックリンク
          link: /editor/links
          image: /images/graph.webp
          alt: メモ同士のリンクを線で結んだグラフ表示
          body: メモやブロックへリンクし、リンクされたメモの下にバックリンクを出します。つながりはグラフ表示で見られます。
        - title: データベース表示
          link: /organize/database
          image: /images/database-board.webp
          alt: 状態のプロパティで列に分けたボード
          body: ノートブックにプロパティを決めると、メモをテーブルかボードで並べて、その場で値を変えられます。
        - title: AIチャットとMCP
          link: /ai/chat
          image: /images/ai-approval.webp
          alt: AIが提案した本文の変更を差分で確かめるカード
          body: Claude APIやローカルのLLMにつなぎ、メモの要約や書き直しを頼めます。AIによる変更は差分を見てから許可します。
        - title: 検索とコマンドパレット
          link: /organize/search
          image: /images/command-palette.webp
          alt: メモ・設定・操作を探すコマンドパレット
          body: Ctrl+Kで、メモ・ノートブック・タグ・設定の項目・操作をまとめて探せます。
        - title: Androidのアプリ
          link: /platform/mobile
          image: /images/phone-list.webp
          alt: Androidのアプリのメモの一覧
          body: ほかのアプリからの共有、カメラ、ホーム画面のウィジェットに対応しています。
    - heading: ほかにできること
      links:
        - '<a href="./editor/attachments">画像・ファイル・録音</a>を添付し、PDFはメモの中でプレビュー'
        - '<a href="./editor/outline">見出しと箇条書きにズーム</a>して、その部分だけを表示'
        - '<a href="./organize/workspace">タブ・左右に並べる表示・別のウィンドウ</a>でメモを開く'
        - 'メモとチェックリストに<a href="./organize/reminders">期限</a>を付け、OSの通知で知らせる'
        - 'メモごとの<a href="./organize/history-trash">履歴</a>から、前のバージョンに戻す'
        - '<a href="./organize/spaces">スペース</a>で、仕事用と個人用のように保管先を分ける'
        - 'Markdown・HTML・テキストへの<a href="./sync/backup-export">エクスポート</a>と、暗号化したバックアップ'
        - '<a href="./customize/appearance">テーマ</a>・カスタムCSS・<a href="./customize/shortcuts">ショートカット</a>・<a href="./customize/plugins">プラグイン</a>で変える'
---

<DocsHome />
