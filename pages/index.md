---
layout: home
title: Sedum Note
description: エンドツーエンド暗号化（E2EE）のメモアプリ。S3互換ストレージかWebDAVで同期し、Windows・macOS・Linux・Android・Webで使えます。
sidebar: false
outline: false
---

<main class="sedum-home">
  <section class="sedum-hero">
    <img class="sedum-hero-icon" src="/app-icon.png" alt="" width="88" height="88">
    <h1 class="sedum-title">Sedum Note</h1>
    <p class="sedum-lead">メモをデバイスの中で暗号化し、自分で用意したS3互換ストレージかWebDAVサーバーで同期するメモアプリです。同期しなくても、オフラインのまま使えます。</p>
    <p class="sedum-platforms"><span>対応</span>Windows / macOS / Linux / Android / Web</p>
    <div class="sedum-actions">
      <a class="sedum-action primary" href="./guide/install">インストール</a>
      <a class="sedum-action" href="https://aida0710.github.io/sedum-note/">Web版を開く</a>
      <a class="sedum-action" href="./guide/introduction">はじめる</a>
      <a class="sedum-action" href="https://github.com/aida0710/sedum-note">GitHub</a>
    </div>
    <div class="sedum-preview">
      <img src="/images/workspace.webp" alt="サイドバーにノートブックとメモ、右に設計メモを開いたPCの画面" width="2560" height="1600">
    </div>
  </section>

  <section class="sedum-section">
    <div class="sedum-section-heading">
      <h2>主な機能</h2>
      <p>表・数式・図・手書きを入れられるエディタと、ノートブック・タグ・プロパティでの整理、暗号化した同期を1つのアプリで使えます。</p>
    </div>
    <div class="sedum-feature-grid">
      <article class="sedum-feature sedum-feature-wide"><img src="/images/editor-slash-menu.webp" alt="「/」で開くブロックの種類のメニュー" loading="lazy"><div class="sedum-feature-body"><h3><a href="./editor/basics">ブロックエディタ</a></h3><p>「/」から見出し・リスト・表・コード・画像などを入れられます。Markdownを貼り付けると、そのまま書式になります。</p></div></article>
      <article class="sedum-feature sedum-feature-wide"><img src="/images/setup-sync.webp" alt="同期先のエンドポイントとバケットを入力する画面" loading="lazy"><div class="sedum-feature-body"><h3><a href="./sync/setup">エンドツーエンド暗号化の同期</a></h3><p>暗号化はデバイスの中で行い、同期先にはランダムなIDの暗号文だけを置きます。2台で同時に書いても、両方の変更が残ります。</p></div></article>
      <article class="sedum-feature"><img src="/images/editor-math-callout.webp" alt="数式とコールアウトを入れたメモ" loading="lazy"><div class="sedum-feature-body"><h3><a href="./editor/blocks">数式・図・手書き</a></h3><p>LaTeXの数式、Mermaidの図、手書きの線、段組み、脚注、コールアウトを本文に入れられます。</p></div></article>
      <article class="sedum-feature"><img src="/images/graph.webp" alt="メモ同士のリンクを線で結んだグラフ表示" loading="lazy"><div class="sedum-feature-body"><h3><a href="./editor/links">リンクとバックリンク</a></h3><p>メモやブロックへリンクし、リンクされたメモの下にバックリンクを出します。つながりはグラフ表示で見られます。</p></div></article>
      <article class="sedum-feature"><img src="/images/database-board.webp" alt="状態のプロパティで列に分けたボード" loading="lazy"><div class="sedum-feature-body"><h3><a href="./organize/database">データベース表示</a></h3><p>ノートブックにプロパティを決めると、メモをテーブルかボードで並べて、その場で値を変えられます。</p></div></article>
      <article class="sedum-feature"><img src="/images/ai-approval.webp" alt="AIが提案した本文の変更を差分で確かめるカード" loading="lazy"><div class="sedum-feature-body"><h3><a href="./ai/chat">AIチャットとMCP</a></h3><p>Claude APIやローカルのLLMにつなぎ、メモの要約や書き直しを頼めます。AIによる変更は差分を見てから許可します。</p></div></article>
      <article class="sedum-feature"><img src="/images/command-palette.webp" alt="メモ・設定・操作を探すコマンドパレット" loading="lazy"><div class="sedum-feature-body"><h3><a href="./organize/search">検索とコマンドパレット</a></h3><p>Ctrl+Kで、メモ・ノートブック・タグ・設定の項目・操作をまとめて探せます。</p></div></article>
      <article class="sedum-feature"><img src="/images/phone-list.webp" alt="Androidのアプリのメモの一覧" loading="lazy"><div class="sedum-feature-body"><h3><a href="./platform/mobile">Androidのアプリ</a></h3><p>ほかのアプリからの共有、カメラ、ホーム画面のウィジェットに対応しています。</p></div></article>
    </div>
  </section>

  <section class="sedum-section">
    <div class="sedum-section-heading">
      <h2>ほかにできること</h2>
    </div>
    <ul class="sedum-list">
      <li><a href="./editor/attachments">画像・ファイル・録音</a>を添付し、PDFはメモの中でプレビュー</li>
      <li><a href="./editor/outline">見出しと箇条書きにズーム</a>して、その部分だけを表示</li>
      <li><a href="./organize/workspace">タブ・左右に並べる表示・別のウィンドウ</a>でメモを開く</li>
      <li>メモとチェックリストに<a href="./organize/reminders">期限</a>を付け、OSの通知で知らせる</li>
      <li>メモごとの<a href="./organize/history-trash">履歴</a>から、前のバージョンに戻す</li>
      <li><a href="./organize/spaces">スペース</a>で、仕事用と個人用のように保管先を分ける</li>
      <li>Markdown・HTML・テキストへの<a href="./sync/backup-export">エクスポート</a>と、暗号化したバックアップ</li>
      <li><a href="./customize/appearance">テーマ</a>・カスタムCSS・<a href="./customize/shortcuts">ショートカット</a>・<a href="./customize/plugins">プラグイン</a>で変える</li>
    </ul>
  </section>
</main>
