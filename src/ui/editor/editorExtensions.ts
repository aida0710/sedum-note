// エディタに入れる機能。保存する文書の形（Yjs の XmlFragment の中のノード名）はこの組み合わせで
// 決まるので、機能を外すと、その形を使った既存のメモが読めなくなる。

import Collaboration from "@tiptap/extension-collaboration";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { Placeholder } from "@tiptap/extensions";
import StarterKit from "@tiptap/starter-kit";
import type * as Y from "yjs";
import { translate } from "../i18n/translate";
import { AttachmentImage } from "./attachmentImageNode";

export function createEditorExtensions(body: Y.XmlFragment) {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      link: { openOnClick: false, autolink: true },
      // 取り消しは Collaboration が持つ（自分の変更だけを取り消し、ほかのデバイスの変更は残す）。
      undoRedo: false,
    }),
    Collaboration.configure({ fragment: body }),
    TaskList,
    TaskItem.configure({ nested: true }),
    Placeholder.configure({ placeholder: translate("editor.bodyPlaceholder") }),
    AttachmentImage,
  ];
}
