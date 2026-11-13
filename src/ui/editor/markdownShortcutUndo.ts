// Markdown の書き方（「- 」「1. 」「[ ] 」「> 」「# 」など）を書式に変えた直後に Backspace を押すと、書式をやめて打った文字に戻す。
// 「1.」をそのまま書きたいときに使う。
//
// Tiptap にも同じ取り消し（undoInputRule）があるが、変えた直後にほかの機能が本文を直すと（末尾に段落を足す TrailingNode、
// ブロックに ID を付ける BlockIds など）、その直しで取り消しの記録を捨ててしまい、Backspace は書式を外すだけになる。
// ここでは、変換と、同じ入力に続けて足された直しをまとめて覚え、まとめて戻す。

import { Extension } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { type EditorState, Plugin, PluginKey, type Transaction } from "@tiptap/pm/state";
import type { Step } from "@tiptap/pm/transform";
import type { EditorView } from "@tiptap/pm/view";

// 箇条書きの Backspace（項目を外す）や、ほかの機能の Backspace より先に見る。
const BEFORE_LIST_KEYMAPS = 1200;

// 1 つの変更の手順と、各手順の前の本文（戻すときに手順を逆にするのに要る）。
type RecordedChange = { steps: readonly Step[]; docs: readonly ProseMirrorNode[] };

// 戻せる変換。changes は、変換とそれに続けて足された直しを、行った順に並べたもの。
// from〜to は、変換のきっかけになった打った文字（「- 」の空白など）の位置で、text はその文字。
type UndoableShortcut = { changes: RecordedChange[]; from: number; to: number; text: string };

// Tiptap の入力の変換（input rule）が、変換した transaction に付ける印。
type InputRuleRecord = { transform: Transaction; from: number; to: number; text: string };

const markdownShortcutUndoKey = new PluginKey<UndoableShortcut | null>("markdownShortcutUndo");

// 入力の変換のプラグインは 1 つとは限らない（Tiptap が、機能のまとまりごとに作ることがある）ので、全部を見る。
function inputRuleRecordOf(transaction: Transaction, state: EditorState): InputRuleRecord | null {
  for (const plugin of state.plugins) {
    const record = (plugin.spec as { isInputRules?: boolean }).isInputRules ? (transaction.getMeta(plugin) as InputRuleRecord | undefined) : undefined;
    if (record) {
      return record;
    }
  }
  return null;
}

function nextUndoableShortcut(transaction: Transaction, previous: UndoableShortcut | null, state: EditorState): UndoableShortcut | null {
  const record = inputRuleRecordOf(transaction, state);
  if (record) {
    return { changes: [{ steps: record.transform.steps, docs: record.transform.docs }], from: record.from, to: record.to, text: record.text };
  }
  if (!previous) {
    return null;
  }
  // 変換と同じ入力に続けて、ほかの機能が足した直し。いっしょに戻す。
  if (transaction.getMeta("appendedTransaction")) {
    return transaction.docChanged ? { ...previous, changes: [...previous.changes, { steps: transaction.steps, docs: transaction.docs }] } : previous;
  }
  // 打ち続けた、カーソルを動かした、ほかのデバイスの変更が届いた、のどれかなら、もう戻さない。
  return transaction.docChanged || transaction.selectionSet ? null : previous;
}

// 覚えている変換を戻す。戻せるものが無ければ false（Backspace のふつうの動きに任せる）。
function undoMarkdownShortcut(view: EditorView): boolean {
  const shortcut = markdownShortcutUndoKey.getState(view.state);
  if (!shortcut) {
    return false;
  }
  const transaction = view.state.tr;
  // 行った順の逆に、手順を 1 つずつ逆にする。
  for (const change of [...shortcut.changes].reverse()) {
    for (let index = change.steps.length - 1; index >= 0; index -= 1) {
      transaction.step(change.steps[index]!.invert(change.docs[index]!));
    }
  }
  // 打った文字を入れ直す（Tiptap の undoInputRule と同じ）。
  if (shortcut.text) {
    const marks = transaction.doc.resolve(shortcut.from).marks();
    transaction.replaceWith(shortcut.from, shortcut.to, view.state.schema.text(shortcut.text, marks));
  } else {
    transaction.delete(shortcut.from, shortcut.to);
  }
  view.dispatch(transaction.scrollIntoView());
  return true;
}

export const MarkdownShortcutUndo = Extension.create({
  name: "markdownShortcutUndo",
  priority: BEFORE_LIST_KEYMAPS,
  addKeyboardShortcuts() {
    return { Backspace: ({ editor }) => undoMarkdownShortcut(editor.view) };
  },
  addProseMirrorPlugins() {
    return [
      new Plugin<UndoableShortcut | null>({
        key: markdownShortcutUndoKey,
        state: {
          init: () => null,
          apply: (transaction, previous, _oldState, newState) => nextUndoableShortcut(transaction, previous, newState),
        },
      }),
    ];
  },
});
