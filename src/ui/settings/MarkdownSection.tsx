// 設定: Markdown の取り込みと、すべてのメモの書き出し。

import { useRef, useState } from "react";
import type { NoteRepository } from "../../core/notes/noteRepository";
import { translate } from "../i18n/translate";
import { importMarkdownNotes, readImportSources } from "../markdown/markdownImport";
import { useNoteFileExport } from "../markdown/useNoteFileExport";
import { useDialogs } from "../shared/DialogProvider";
import { ProgressStatus } from "../shared/ProgressStatus";
import { useAsyncAction } from "../shared/useAsyncAction";
import type { NoteFileFormat } from "../markdown/noteFileExport";

export function MarkdownSection({ repository }: { repository: NoteRepository }) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [importedCount, setImportedCount] = useState<number | null>(null);
  const importFiles = useAsyncAction(async (files: File[], { reportProgress }) => {
    setImportedCount(null);
    setImportedCount((await importMarkdownNotes(repository, await readImportSources(files), reportProgress)).noteCount);
  });
  const exportNotes = useNoteFileExport(repository);
  const dialogs = useDialogs();
  // 書き出したファイルは暗号化されないので、書き出す前に確かめる。
  const exportAllNotes = async (format: NoteFileFormat) => {
    if (await dialogs.confirm({ message: translate("markdown.exportConfirm"), confirmLabel: translate("markdown.exportConfirmLabel") })) {
      void exportNotes.run({ notes: repository.notes().filter((note) => note.content.trashedAt === null), format });
    }
  };
  const errorMessage = importFiles.errorMessage ?? exportNotes.errorMessage;
  return (
    <section className="settings-section">
      <h2>{translate("settings.markdown")}</h2>
      <p>{translate("settings.markdownDescription")}</p>
      {errorMessage && <div className="form-error" role="alert">{errorMessage}</div>}
      {exportNotes.saved && exportNotes.saved.missingAttachmentCount > 0 && (
        <div className="form-error" role="alert">{translate("settings.markdownMissingAttachments", { count: exportNotes.saved.missingAttachmentCount })}</div>
      )}
      <input ref={fileInput} type="file" accept=".md,.markdown,.zip,text/markdown,application/zip" multiple hidden
        aria-label={translate("settings.markdownImport")}
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = "";
          if (files.length > 0) {
            void importFiles.run(files);
          }
        }} />
      <div className="settings-actions">
        {importFiles.busy && <ProgressStatus label={translate("markdown.importing")} progress={importFiles.progress} />}
        {exportNotes.busy && <ProgressStatus label={translate("markdown.exporting")} progress={exportNotes.progress} />}
        {importedCount !== null && <span className="form-success">{translate("settings.markdownImported", { count: importedCount })}</span>}
        {exportNotes.saved && <span className="form-success">{translate("settings.markdownExported", { count: exportNotes.saved.noteCount })}</span>}
        <button type="button" className="secondary-button" disabled={importFiles.busy} onClick={() => fileInput.current?.click()}>
          {translate("settings.markdownImport")}
        </button>
        <button type="button" className="secondary-button" disabled={exportNotes.busy} onClick={() => void exportAllNotes("markdown")}>
          {translate("settings.markdownExport")}
        </button>
        <button type="button" className="secondary-button" disabled={exportNotes.busy} onClick={() => void exportAllNotes("html")}>
          {translate("settings.htmlExport")}
        </button>
        <button type="button" className="secondary-button" disabled={exportNotes.busy} onClick={() => void exportAllNotes("text")}>
          {translate("settings.textExport")}
        </button>
      </div>
    </section>
  );
}
