// エディタに入れる機能。保存する文書の形（Yjs の XmlFragment の中のノード名）はこの組み合わせで
// 決まるので、機能を外すと、その形を使った既存のメモが読めなくなる。機能を足したら、
// 足す前のアプリがそのノードを消さないよう、BODY_SCHEMA_VERSION（core/notes/bodySchema.ts）を上げる。

import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import Collaboration from "@tiptap/extension-collaboration";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { TableKit } from "@tiptap/extension-table";
import { Placeholder } from "@tiptap/extensions";
import StarterKit from "@tiptap/starter-kit";
import { common, createLowlight } from "lowlight";
import type * as Y from "yjs";
import { translate } from "../i18n/translate";
import { AttachmentFile } from "./attachmentFileNode";
import { AttachmentImage } from "./attachmentImageNode";
import { NoteLink } from "./noteLinkNode";
import { SlashCommands } from "./slashCommandExtension";
import type { SlashMenuController } from "./slashMenuController";

// よく使われる言語（highlight.js の common の組）だけを入れる。言語の指定が無いコードは中身から推す。
const codeHighlighter = createLowlight(common);

// 文書の形（ノードと書式）を決める機能。エディタのほか、Markdown との変換（ui/markdown）でも使う。
export function documentExtensions() {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      link: { openOnClick: false, autolink: true },
      // コードの色付けつきのもの（CodeBlockLowlight）に置き換える。ノード名は同じ codeBlock。
      codeBlock: false,
      // 取り消しは Collaboration が持つ（自分の変更だけを取り消し、ほかのデバイスの変更は残す）。
      undoRedo: false,
    }),
    TaskList,
    TaskItem.configure({ nested: true }),
    CodeBlockLowlight.configure({ lowlight: codeHighlighter }),
    // スマホの幅では表が画面をはみ出すので、包んだ要素の中で横に送れるようにする。
    TableKit.configure({ table: { resizable: false, renderWrapper: true } }),
    AttachmentImage,
    AttachmentFile,
    NoteLink,
  ];
}

export function createEditorExtensions(body: Y.XmlFragment, slashMenuController: SlashMenuController) {
  return [
    ...documentExtensions(),
    SlashCommands.configure({ controller: slashMenuController }),
    Collaboration.configure({ fragment: body }),
    Placeholder.configure({ placeholder: translate("editor.bodyPlaceholder") }),
  ];
}
