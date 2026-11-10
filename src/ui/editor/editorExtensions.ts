// エディタに入れる機能。保存する文書の形（JSON）はこの組み合わせで決まるので、
// 機能を外すと、その形を使った既存のメモが読めなくなる。

import { TaskItem, TaskList } from "@tiptap/extension-list";
import { Placeholder } from "@tiptap/extensions";
import StarterKit from "@tiptap/starter-kit";
import { translate } from "../i18n/translate";
import { AttachmentImage } from "./attachmentImageNode";

export function createEditorExtensions() {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      link: { openOnClick: false, autolink: true, protocols: ["http", "https", "mailto"] },
    }),
    TaskList,
    TaskItem.configure({ nested: true }),
    Placeholder.configure({ placeholder: translate("editor.bodyPlaceholder") }),
    AttachmentImage,
  ];
}
