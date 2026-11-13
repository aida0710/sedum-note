// メモをファイル（Markdown・HTML・テキスト）に書き出して保存する動き。書き出したファイルは暗号化されないので、
// 呼び出す画面が、そのことを先に確かめてもらう（メモの「…」は書き出しのダイアログで、設定は確認のダイアログで）。

import { useState } from "react";
import type { LiveNote } from "../../core/notes/noteRecords";
import type { NoteRepository } from "../../core/notes/noteRepository";
import { translate } from "../i18n/translate";
import { fileNameDate } from "../platform/fileNameDate";
import { saveFile } from "../platform/saveFile";
import { type AsyncAction, useAsyncAction } from "../shared/useAsyncAction";
import { languageInUse } from "../i18n/languageInUse";
import { exportNotesAsFiles, type NoteFileExport, type NoteFileFormat } from "./noteFileExport";

export type NoteFileExportRequest = { notes: LiveNote[]; format: NoteFileFormat };

export type NoteFileExportAction = AsyncAction<NoteFileExportRequest> & {
  // 最後に保存した書き出し。まだ書き出していないか、保存をやめたら null。
  saved: NoteFileExport | null;
};

export function useNoteFileExport(repository: NoteRepository): NoteFileExportAction {
  const [saved, setSaved] = useState<NoteFileExport | null>(null);
  const action = useAsyncAction(async ({ notes, format }: NoteFileExportRequest, { reportProgress }) => {
    setSaved(null);
    await repository.flush();
    const exported = await exportNotesAsFiles({
      repository, notes, format, language: languageInUse(), untitledName: translate("sidebar.untitled"), archiveName: exportArchiveName(format, new Date()), reportProgress,
    });
    if (await saveFile({ suggestedName: exported.suggestedName, parts: [exported.bytes], mimeType: exported.mimeType })) {
      setSaved(exported);
    }
  });
  return { ...action, saved };
}

// 例: sedum-note-markdown-20261111
function exportArchiveName(format: NoteFileFormat, now: Date): string {
  return `sedum-note-${format}-${fileNameDate(now)}`;
}
