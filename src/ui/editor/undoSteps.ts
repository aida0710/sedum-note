// 本文の取り消しの単位を区切る。取り消しは Yjs の UndoManager（Collaboration）が持ち、続けて行った変更は、
// 既定では間が短いと 1 回の取り消しにまとまる。置換や貼り付けのように、前後の入力と分けて戻したい変更の前後で呼ぶ。

import type { EditorState } from "@tiptap/pm/state";
import { yUndoPluginKey } from "@tiptap/y-tiptap";

// このあとの変更を、新しい取り消しの単位から始める。
export function startNewUndoStep(state: EditorState): void {
  (yUndoPluginKey.getState(state) as { undoManager?: { stopCapturing: () => void } } | undefined)?.undoManager?.stopCapturing();
}
