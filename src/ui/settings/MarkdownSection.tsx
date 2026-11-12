// 設定: Markdown の取り込みと、すべてのメモの書き出し。

import { useRef, useState } from "react";
import type { NoteRepository } from "../../core/notes/noteRepository";
import { translate } from "../i18n/translate";
import { importMarkdownNotes, readImportSources } from "../markdown/markdownImport";
import { useNoteFileExport } from "../markdown/useNoteFileExport";
import { useNoteLockState } from "../session/noteLockState";
import { useConfirmPassphrase } from "../session/PassphraseConfirmProvider";
import { useAsyncAction } from "../shared/useAsyncAction";
import type { NoteFileFormat } from "../markdown/noteFileExport";

export function MarkdownSection({ repository }: { repository: NoteRepository }) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [importedCount, setImportedCount] = useState<number | null>(null);
  const importFiles = useAsyncAction(async (files: File[]) => {
    setImportedCount(null);
    setImportedCount((await importMarkdownNotes(repository, await readImportSources(files))).noteCount);
  });
  const exportNotes = useNoteFileExport(repository);
  const { lockedNoteIds } = useNoteLockState();
  const confirmPassphrase = useConfirmPassphrase();
  const exportAllNotes = async (format: NoteFileFormat) => {
    const notes = repository.notes().filter((note) => note.content.trashedAt === null);
    // ロックしたメモの中身もファイルに出るので、先にパスフレーズを確かめる。
    if (notes.some((note) => lockedNoteIds.has(note.id)) && !(await confirmPassphrase(translate("lock.confirmToExport")))) {
      return;
    }
    await exportNotes.run({ notes, format });
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
      <div className="form-actions">
        {importedCount !== null && <span className="form-success">{translate("settings.markdownImported", { count: importedCount })}</span>}
        {exportNotes.saved && <span className="form-success">{translate("settings.markdownExported", { count: exportNotes.saved.noteCount })}</span>}
        <button type="button" className="secondary-button" disabled={importFiles.busy} onClick={() => fileInput.current?.click()}>
          {translate("settings.markdownImport")}
        </button>
        <button type="button" className="secondary-button" disabled={exportNotes.busy} onClick={() => exportAllNotes("markdown")}>
          {translate("settings.markdownExport")}
        </button>
        <button type="button" className="secondary-button" disabled={exportNotes.busy} onClick={() => exportAllNotes("html")}>
          {translate("settings.htmlExport")}
        </button>
        <button type="button" className="secondary-button" disabled={exportNotes.busy} onClick={() => exportAllNotes("text")}>
          {translate("settings.textExport")}
        </button>
      </div>
    </section>
  );
}
