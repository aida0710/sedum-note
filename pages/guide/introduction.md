---
title: Sedum Noteとは
description: デバイスの中で暗号化してから同期する、ローカルファーストのメモアプリ。
---

# Sedum Noteとは

Sedum Noteはメモをデバイスの中で暗号化してから保存するメモアプリです。メモはまずそのデバイスに保存され、同期を設定すると、自分で用意したS3互換ストレージかWebDAVサーバーを通して、ほかのデバイスと同期します。

![サイドバーにノートブックとメモ、右に設計メモを開いたPCの画面](/images/workspace.webp)

## 特徴

- メモ・ノートブック・画像はデバイスの中で暗号化してから同期先へ送ります。同期先に置かれるのは暗号文とランダムなIDだけで、タイトルやノートブックの名前も見えません。
- 同期しなくても使えます。同期はあとから「設定」で追加できます。
- オフラインでも書けます。ネットワークにつながったら、まとめて同期します。
- 2台で同じメモを同時に編集しても、両方の変更が1つのメモにマージされます。
- 同期先はAWS S3・Cloudflare R2・MinIOなどのS3互換ストレージか、NextcloudなどのWebDAVサーバーです。Sedum Noteが同期用のサーバーを用意することはありません。

## 対応している環境

| 環境 | 入手先 |
| --- | --- |
| Windows・macOS・Linux | [GitHub Releases](https://github.com/aida0710/sedum-note/releases/latest)のインストーラー |
| Android | [GitHub Releases](https://github.com/aida0710/sedum-note/releases/latest)のAPK |
| Web | [Web版](https://aida0710.github.io/sedum-note/)をブラウザで開く |

PCのアプリ（Windows・macOS・Linux）だけに、AIのクライアントからメモを操作する[MCPサーバー](/ai/mcp)が入っています。環境ごとの違いは[スマホとAndroid](/platform/mobile)と[Web版](/platform/web)にまとめています。

## 画面の構成

PCの画面では、左のサイドバーにノートブックとメモを木の形で並べ、右にメモをタブで開きます。サイドバーの上には「すべてのメモ」「お気に入り」「期限の一覧」「ゴミ箱」、下には同期の状態と設定（歯車）のボタンがあります。

スマホの画面では、メモの一覧とエディタを切り替えて使います。下のバーから「メモ」「ノートブック」「お気に入り」「設定」を開きます。

## 次に読む

[インストール](/guide/install)でアプリを入れ、[最初の設定](/guide/first-steps)でパスフレーズを決めて使い始めます。
