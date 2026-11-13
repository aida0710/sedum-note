// カーソルのある所（選んだ範囲）に付いている書式。書式のボタンを押したままの形で出すのに使う。
// スマホの下のツールバー（EditorToolbar.tsx）と、PC で文字を選んだときに出すボタン（SelectionToolbar.tsx）が使う。

import { type Editor, useEditorState } from "@tiptap/react";
import type { EditorColorName } from "./editorColors";

export type FormattingState = {
  heading: boolean;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  bulletList: boolean;
  orderedList: boolean;
  taskList: boolean;
  link: boolean;
  codeBlock: boolean;
  table: boolean;
  highlightColor: EditorColorName | null;
  textColor: EditorColorName | null;
};

export function useFormattingState(editor: Editor): FormattingState {
  return useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      heading: current.isActive("heading"),
      bold: current.isActive("bold"),
      italic: current.isActive("italic"),
      underline: current.isActive("underline"),
      bulletList: current.isActive("bulletList"),
      orderedList: current.isActive("orderedList"),
      taskList: current.isActive("taskList"),
      link: current.isActive("link"),
      codeBlock: current.isActive("codeBlock"),
      table: current.isActive("table"),
      highlightColor: (current.getAttributes("highlight").color ?? null) as EditorColorName | null,
      textColor: (current.getAttributes("textColor").color ?? null) as EditorColorName | null,
    }),
  });
}
