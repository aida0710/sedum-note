// 選んだブロック（↑↓ で移った区切り線・数式・写真など、中に文字を打てないブロック）の上で打ち始めたときに、
// そのブロックを消さない。エディタの既定では、選んだブロックが打った文字に置き換わる。
// 打った文字は、ブロックのすぐ下の段落（空の段落が無ければ足す）に入れる。

import { Extension } from "@tiptap/core";
import { type EditorState, NodeSelection, Plugin, TextSelection, type Transaction } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";

// 選んだブロックのすぐ下の空の段落へカーソルを移す変更。ブロックを選んでいないときと、段落を置けない所では null。
function moveCursorBelowSelectedBlock(state: EditorState): Transaction | null {
  const { selection, schema } = state;
  const paragraphType = schema.nodes.paragraph;
  if (!(selection instanceof NodeSelection) || !selection.node.isBlock || !paragraphType) {
    return null;
  }
  const { $to } = selection;
  const transaction = state.tr;
  const blockBelow = $to.nodeAfter;
  const hasEmptyParagraphBelow = blockBelow?.type === paragraphType && blockBelow.content.size === 0;
  if (!hasEmptyParagraphBelow) {
    if (!$to.parent.canReplaceWith($to.index(), $to.index(), paragraphType)) {
      return null;
    }
    transaction.insert($to.pos, paragraphType.create());
  }
  return transaction.setSelection(TextSelection.create(transaction.doc, $to.pos + 1));
}

// キーを通らずに文字が入る入力の種類（日本語の変換、絵文字の一覧、音声入力、スマホのキーボードの候補）。
const TEXT_INPUT_TYPES = ["insertText", "insertCompositionText", "insertReplacementText"];

// 選んだブロックがあれば、すぐ下の段落に文字を入れる変更。選んでいなければ null。
function insertTextBelowSelectedBlock(state: EditorState, text: string): Transaction | null {
  return moveCursorBelowSelectedBlock(state)?.insertText(text).scrollIntoView() ?? null;
}

// 選んだブロックがあれば、文字が入る前に、カーソルをすぐ下の段落へ移す。
function moveCursorBeforeTextArrives(view: EditorView): void {
  const transaction = moveCursorBelowSelectedBlock(view.state);
  if (transaction) {
    view.dispatch(transaction);
  }
}

export const SelectedBlockTyping = Extension.create({
  name: "selectedBlockTyping",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          // キーで打った文字。
          handleTextInput: (view, _from, _to, text) => {
            const transaction = insertTextBelowSelectedBlock(view.state, text);
            if (!transaction) {
              return false;
            }
            view.dispatch(transaction);
            return true;
          },
          // キーを通らない文字は handleTextInput に来る前にブロックを置き換えるので、入る前に受ける。どちらも、既定の入力はそのまま続けさせる。
          handleDOMEvents: {
            compositionstart: (view) => {
              moveCursorBeforeTextArrives(view);
              return false;
            },
            beforeinput: (view, event) => {
              // 打った文字が決まっている入力は、ブラウザに入れさせずにここで入れる。WebKit は文字を入れる場所を
              // beforeinput より前に決めるので、ここでカーソルを動かしても、選んだブロックが文字に置き換わる。
              if (event.inputType === "insertText" && typeof event.data === "string") {
                const transaction = insertTextBelowSelectedBlock(view.state, event.data);
                if (transaction) {
                  event.preventDefault();
                  view.dispatch(transaction);
                  return true;
                }
                return false;
              }
              // 変換中の文字などは取り消せない（preventDefault が効かない）ので、カーソルだけを先に移す。
              if (TEXT_INPUT_TYPES.includes(event.inputType)) {
                moveCursorBeforeTextArrives(view);
              }
              return false;
            },
          },
        },
      }),
    ];
  },
});
