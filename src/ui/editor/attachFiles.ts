// 選んだ・貼り付けた・落としたファイルを、暗号化した添付にして本文へ入れる。
// 画像は本文に表示し、それ以外は名前と大きさの出るファイルとして入れる。

import type { Editor } from "@tiptap/react";
import { ATTACHMENT_FILE_NODE, ATTACHMENT_IMAGE_NODE } from "../../core/notes/bodyText";
import type { NoteRepository } from "../../core/notes/noteRepository";
import type { ReportProgress } from "../../core/progress/taskProgress";
import { translate } from "../i18n/translate";
import { UserFacingError } from "../i18n/userFacingError";
import { formatByteSize } from "../shared/formatByteSize";
import { reduceImageFile } from "./reduceImage";

// 添付 1 件の上限。添付は 1 件を丸ごとメモリに載せて暗号化し、1 回の PUT で送るので、
// スマホの WebView でも扱える大きさに抑える。
export const MAX_ATTACHMENT_BYTES = 100 * 1024 * 1024;

type AttachFilesInput = {
  files: File[];
  // 写真を小さくしてから添付するか。
  reduceImages: boolean;
  editor: Editor;
  repository: NoteRepository;
  // 添付し終えたファイルの数を渡す（大きな動画や PDF は、暗号化に数秒かかる）。
  reportProgress?: ReportProgress;
};

export async function attachFiles({ files, reduceImages, editor, repository, reportProgress }: AttachFilesInput): Promise<void> {
  for (const [index, pickedFile] of files.entries()) {
    reportProgress?.({ done: index, total: files.length });
    const file = reduceImages ? await reduceImageFile(pickedFile) : pickedFile;
    if (file.size > MAX_ATTACHMENT_BYTES) {
      throw new UserFacingError(translate("editor.fileTooLarge", { name: file.name, limit: formatByteSize(MAX_ATTACHMENT_BYTES) }));
    }
    const mimeType = file.type || "application/octet-stream";
    const reference = await repository.storeAttachment({ bytes: new Uint8Array(await file.arrayBuffer()), mimeType, fileName: file.name });
    const attributes = { attachmentId: reference.id, fileName: reference.fileName, mimeType, byteLength: file.size };
    const type = mimeType.startsWith("image/") ? ATTACHMENT_IMAGE_NODE : ATTACHMENT_FILE_NODE;
    // 添付だけを入れると添付が選ばれたままになり、続けて打つ文字や書式のボタンが
    // 効かない。後ろに空の段落を足して、そこへ移る。本文にカーソルが無いとき
    // （スマホでファイルの選択画面から戻ったときなど）は、先頭ではなく末尾に入れる。
    const position = editor.isFocused ? undefined : "end";
    editor.chain().focus(position).insertContent([{ type, attrs: attributes }, { type: "paragraph" }]).run();
  }
}
