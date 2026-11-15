---
title: MCPサーバー
description: PCのアプリが持つMCPサーバーを、Claude CodeなどのAIのクライアントから使う方法。
---

# MCPサーバー

PCのアプリ（Windows・macOS・Linux）は、[MCP](https://modelcontextprotocol.io/)に対応したAIのクライアントから、メモの検索・読み取り・作成・編集をできるようにするMCPサーバーを持っています。Web版とAndroidのアプリには入っていません。

## 有効にする

MCPサーバーは既定でオフです。「設定」の「AI」ページの「MCPサーバー」で「MCPサーバーを起動する」をオンにすると、クライアントに設定する接続情報（URLとトークン）が出ます。

- 使えるのは、アプリのロックを解除している間だけです。ロックすると止まります。
- 接続できるのは、このデバイスの中（`http://127.0.0.1:47821/mcp`）からだけです。
- クライアントは設定に出るトークンを`Authorization: Bearer <トークン>`のヘッダーで送ります。トークンを知っている人はメモを読めるため、他人に教えないでください。「トークンを再生成」で作り直すと、前のトークンで接続しているクライアントは使えなくなります。

## クライアントの設定

Claude Codeでは、次のコマンドで追加します。`<トークン>`は、設定に出るトークンに置き換えます。

```sh
claude mcp add --transport http sedum-note http://127.0.0.1:47821/mcp --header "Authorization: Bearer <トークン>"
```

対応しているのは、MCPの仕様2026-07-28のStreamable HTTPです。それより前の手順（`initialize`で始める形）で接続するクライアントからは接続できません。Claude Code 2.1と、公式のクライアント（`@modelcontextprotocol/client` 2.4で`versionNegotiation`を`auto`にしたもの）で接続できることを確かめています。

## できる操作

| ツール | 操作 |
| --- | --- |
| `search_notes` | メモを検索する |
| `get_note` | メモを読む。長い本文は`offset`と`maxCharacters`で分けて読める |
| `list_notebooks`、`list_tags` | ノートブックとタグの一覧を見る |
| `create_note`、`update_note` | メモを作る、タイトルやノートブックなどを変える |
| `replace_note_body`、`append_to_note` | 本文を編集する、末尾に追加する |
| `move_note_to_trash`、`restore_note_from_trash` | ゴミ箱に移す、戻す |
| `create_notebook`、`rename_notebook`、`delete_notebook` | ノートブックを作る、名前を変える、削除する |
| `delete_note_permanently` | 完全に削除する（「完全な削除も許可する」をオンにしたときだけ） |

- 本文はMarkdownでやり取りします。`replace_note_body`は、変わったブロックだけを入れ替え、変えていないブロックの書式（文字色など）を残します。
- 本文を書き換える前の状態と書き換えた結果は、そのメモの履歴に残ります（書き換えた結果は「MCPの編集」）。
- 完全な削除は設定で許可したときだけできます。完全に削除したメモはすべてのデバイスから消え、元に戻せません。

## 送られるデータ

AIが読んだメモは、暗号化されない形でAIの提供元に送られます。
