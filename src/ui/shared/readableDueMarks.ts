// 本文を文字のまま見せる所（スマホの一覧の要約、検索とコマンドパレットの抜粋）で、期限の印（「📅 2026-11-19 09:00」）を
// 画面の日時の書き方（期限の一覧と同じ formatDueTime）にする。印の絵文字は環境の絵文字のフォントで描かれ、フォントが無いと
// 四角になる。本文の中では editor/dueMarks.ts がアイコンに置き換えている。AI や MCP に渡す本文は、印のまま渡す。

import { replaceDueMarks } from "../../core/notes/dueTimes";
import { formatDueTime } from "./formatTime";

export function withReadableDueMarks(text: string): string {
  return replaceDueMarks(text, formatDueTime);
}
