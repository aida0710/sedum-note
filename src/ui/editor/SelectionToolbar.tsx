// PC で本文の文字を選んだときだけ、選んだ所の上に出す書式のボタン（見出し・太字・斜体・下線・ハイライト・文字色・リンク）と、
// 選んだ所を AI に頼むボタン（SelectionAiMenu.tsx）。
// ふだんは書式のボタンを画面に並べず、書いている間は本文だけを見せる。写真・表などの挿入は「/」から使う。

import { type EditorState, NodeSelection } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import type { Editor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import { useFormattingState } from "./formattingState";
import { SelectionAiMenu } from "./SelectionAiMenu";
import { LinkTool, TextColorTools, TextStyleTools } from "./TextFormattingTools";

// 選んだ範囲と、ボタンの間（px）。
const GAP_ABOVE_SELECTION = 8;

type SelectionToolbarProps = {
  editor: Editor;
  // AI に頼むときに、選んだ文字に添えるメモ。
  noteId: string;
  noteTitle: string;
  // リンク先を聞く。やめたら null。
  onAskLink: () => Promise<string | null>;
};

type ShowCondition = { editor: Editor; view: EditorView; state: EditorState; from: number; to: number; element: HTMLElement };

// 文字を選んでいる間だけ出す（全体を選んだとき、表のセルをまとめて選んだときも出す）。写真などのブロックだけを選んだとき、
// コードの中（書式を付けられない）、本文からフォーカスが外れたときは出さない。
function showsForSelection({ editor, view, state, from, to, element }: ShowCondition): boolean {
  const { selection } = state;
  if (selection.empty || selection instanceof NodeSelection || state.doc.textBetween(from, to).length === 0) {
    return false;
  }
  if (!editor.isEditable || editor.isActive("codeBlock")) {
    return false;
  }
  // ボタンを押している間（色の見本を開いたときなど）は、本文からフォーカスが外れても出したままにする。
  return view.hasFocus() || element.contains(document.activeElement);
}

export function SelectionToolbar({ editor, noteId, noteTitle, onAskLink }: SelectionToolbarProps) {
  const state = useFormattingState(editor);
  return (
    <BubbleMenu editor={editor} className="selection-toolbar" shouldShow={showsForSelection}
      options={{ placement: "top", offset: GAP_ABOVE_SELECTION }}>
      <TextStyleTools editor={editor} state={state} />
      <span className="tool-separator" />
      <TextColorTools editor={editor} state={state} />
      <span className="tool-separator" />
      <LinkTool editor={editor} state={state} onAskLink={onAskLink} />
      <span className="tool-separator" />
      <SelectionAiMenu editor={editor} noteId={noteId} noteTitle={noteTitle} />
    </BubbleMenu>
  );
}
