// メモへの添付の受け取り口（写真・ファイルの選択、カメラ、貼り付け・ドロップ）。選ばれたファイルを、
// 設定に従って小さくしてから、暗号化した添付として本文に入れる。

import type { Editor } from "@tiptap/react";
import { type ReactNode, useRef } from "react";
import type { NoteRepository } from "../../core/notes/noteRepository";
import { translate } from "../i18n/translate";
import { deleteCapturedPhotos } from "../platform/capturedPhotos";
import { readDevicePreferences } from "../preferences/devicePreferences";
import { useDialogs } from "../shared/DialogProvider";
import { useAsyncAction } from "../shared/useAsyncAction";
import { attachFiles } from "./attachFiles";
import { REDUCED_IMAGE_MAX_EDGE } from "./reduceImage";

export type NoteAttachments = {
  // 添付を入れるエディタ。エディタを作ったあとに NoteEditor が入れる（エディタの貼り付けの処理が takeFiles を使うため、先にこちらを作る）。
  editor: { current: Editor | null };
  // ファイルが含まれていれば添付として受け取り、true を返す（エディタの既定の処理を止める合図）。
  takeFiles: (files: File[]) => boolean;
  pickImage: () => void;
  pickFile: () => void;
  capturePhoto: () => void;
  errorMessage: string | null;
  // 画面には出ない、ファイルを選ぶための入力欄。
  fileInputs: ReactNode;
};

export function useNoteAttachments(repository: NoteRepository): NoteAttachments {
  const dialogs = useDialogs();
  const editor = useRef<Editor | null>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);

  const attach = useAsyncAction(async (files: File[]) => {
    if (!editor.current) {
      return;
    }
    // 写真を小さくするかは設定で決まる。「毎回聞く」なら、写真が入っているときに 1 回だけ聞く。
    const { imageAttachment } = readDevicePreferences();
    const reduceImages = imageAttachment === "ask" && files.some((file) => file.type.startsWith("image/"))
      ? await dialogs.confirm({
        message: translate("editor.reduceImageQuestion", { edge: REDUCED_IMAGE_MAX_EDGE }),
        confirmLabel: translate("editor.reduceImage"), cancelLabel: translate("editor.keepOriginalImage"),
      })
      : imageAttachment === "reduced";
    try {
      await attachFiles({ files, reduceImages, editor: editor.current, repository });
    } finally {
      // Android のカメラで撮った写真は、暗号化されない一時ファイルで届く。添付にしたら消す。
      deleteCapturedPhotos();
    }
  });
  const takeFiles = (files: File[]): boolean => {
    if (files.length === 0 || !editor.current) {
      return false;
    }
    void attach.run(files);
    return true;
  };
  const takePickedFiles = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    takeFiles(files);
  };

  return {
    editor,
    takeFiles,
    pickImage: () => imageInput.current?.click(),
    pickFile: () => fileInput.current?.click(),
    capturePhoto: () => cameraInput.current?.click(),
    errorMessage: attach.errorMessage,
    fileInputs: (
      <>
        <input ref={imageInput} type="file" accept="image/*" multiple hidden onChange={takePickedFiles} />
        <input ref={fileInput} type="file" multiple hidden onChange={takePickedFiles} />
        <input ref={cameraInput} type="file" accept="image/*" capture="environment" hidden onChange={takePickedFiles} />
      </>
    ),
  };
}
