// 「Markdown で書き出す」のボタンの動き。暗号化されないことを確かめてから、書き出して保存する。

import { useState } from "react";
import type { LiveNote } from "../../core/notes/noteRecords";
import type { NoteRepository } from "../../core/notes/noteRepository";
import { translate } from "../i18n/translate";
import { saveFile } from "../platform/saveFile";
import { useDialogs } from "../shared/DialogProvider";
import { type AsyncAction, useAsyncAction } from "../shared/useAsyncAction";
import { exportNotesAsMarkdown, type MarkdownExport } from "./markdownExport";

export type MarkdownExportAction = AsyncAction<LiveNote[]> & {
  // 最後に保存した書き出し。まだ書き出していないか、やめたら null。
  saved: MarkdownExport | null;
};

export function useMarkdownExport(repository: NoteRepository): MarkdownExportAction {
  const dialogs = useDialogs();
  const [saved, setSaved] = useState<MarkdownExport | null>(null);
  const action = useAsyncAction(async (notes: LiveNote[]) => {
    setSaved(null);
    const accepted = await dialogs.confirm({ message: translate("markdown.exportConfirm"), confirmLabel: translate("markdown.exportConfirmLabel") });
    if (!accepted) {
      return;
    }
    await repository.flush();
    const exported = await exportNotesAsMarkdown({
      repository, notes, untitledName: translate("sidebar.untitled"), archiveName: markdownArchiveName(new Date()),
    });
    if (await saveFile({ suggestedName: exported.suggestedName, parts: [exported.bytes], mimeType: exported.mimeType })) {
      setSaved(exported);
    }
  });
  return { ...action, saved };
}

// 例: sedum-note-markdown-20261111
function markdownArchiveName(now: Date): string {
  const day = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  return `sedum-note-markdown-${day}`;
}
