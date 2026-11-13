// PC で本文の文字を選んだときだけ、選んだ所の上に出す書式のボタン（見出し・太字・斜体・下線・ハイライト・文字色・リンク）と、
// 選んだ所を AI に頼むボタン（SelectionAiMenu.tsx）。
// ふだんは書式のボタンを画面に並べず、書いている間は本文だけを見せる。写真・表などの挿入は「/」から使う。
// 出ている間の Esc は、選択はそのままで、ボタンだけを消す（選び直すとまた出る）。

import { type EditorState, NodeSelection, Plugin, PluginKey } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import type { Editor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import { useEffect, useRef } from "react";
import { isImeKeyEvent } from "../shared/imeKeyEvent";
import { useFormattingState } from "./formattingState";
import { SelectionAiMenu } from "./SelectionAiMenu";
import { LinkTool, TextColorTools, TextStyleTools } from "./TextFormattingTools";

// 選んだ範囲と、ボタンの間（px）。
const GAP_ABOVE_SELECTION = 8;
// ボタンを出す部品（BubbleMenu）のプラグインの名前。この名前の印（"hide"）を付けた変更で、ボタンを消せる。
const SELECTION_TOOLBAR_KEY = "selectionToolbar";
const escapeKey = new PluginKey("selectionToolbarEscape");

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
  const isShown = useRef(false);
  // Esc を、ほかのキーの処理（ズームから戻る、など）より先に受ける。ボタンが出ていなければ、何もせずに渡す。
  useEffect(() => {
    const hideOnEscape = new Plugin({
      key: escapeKey,
      props: {
        handleKeyDown: (view, event) => {
          if (event.key !== "Escape" || isImeKeyEvent(event) || !isShown.current) {
            return false;
          }
          view.dispatch(view.state.tr.setMeta(SELECTION_TOOLBAR_KEY, "hide"));
          return true;
        },
      },
    });
    editor.registerPlugin(hideOnEscape, (plugin, plugins) => [plugin, ...plugins]);
    return () => {
      editor.unregisterPlugin(escapeKey);
    };
  }, [editor]);
  return (
    <BubbleMenu editor={editor} className="selection-toolbar" pluginKey={SELECTION_TOOLBAR_KEY} shouldShow={showsForSelection}
      options={{ placement: "top", offset: GAP_ABOVE_SELECTION, onShow: () => { isShown.current = true; }, onHide: () => { isShown.current = false; } }}>
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
