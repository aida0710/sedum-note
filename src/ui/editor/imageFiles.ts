// 選んだ・貼り付けた・落とした画像を、暗号化した添付にして本文へ入れる。

import type { Editor } from "@tiptap/react";
import type { NoteRepository } from "../../core/notes/noteRepository";
import { ATTACHMENT_IMAGE_NODE } from "../../core/notes/bodyText";
import type { AttachmentImageAttributes } from "./attachmentImageNode";

export function imageFilesOf(files: FileList | null | undefined): File[] {
  return Array.from(files ?? []).filter((file) => file.type.startsWith("image/"));
}

type InsertImageFilesInput = {
  files: File[];
  editor: Editor;
  repository: NoteRepository;
};

export async function insertImageFiles({ files, editor, repository }: InsertImageFilesInput): Promise<void> {
  for (const file of files) {
    const reference = await repository.storeAttachment({
      bytes: new Uint8Array(await file.arrayBuffer()),
      mimeType: file.type,
      fileName: file.name,
    });
    const attributes: AttachmentImageAttributes = { attachmentId: reference.id, fileName: reference.fileName, mimeType: reference.mimeType };
    // 画像だけを入れると画像が選ばれたままになり、続けて打つ文字や書式のボタンが
    // 効かない。後ろに空の段落を足して、そこへ移る。本文にカーソルが無いとき
    // （スマホで写真の選択画面から戻ったときなど）は、先頭ではなく末尾に入れる。
    const position = editor.isFocused ? undefined : "end";
    editor.chain().focus(position).insertContent([{ type: ATTACHMENT_IMAGE_NODE, attrs: attributes }, { type: "paragraph" }]).run();
  }
}
