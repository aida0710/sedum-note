// メモの履歴を見て、選んだ版を別のメモとして復元するダイアログ。

import { useEffect, useState } from "react";
import type { LiveNote } from "../../core/notes/noteRecords";
import type { NoteRepository } from "../../core/notes/noteRepository";
import type { NoteVersion } from "../../core/notes/noteVersions";
import { translate } from "../i18n/translate";
import { formatDateTime } from "../shared/formatTime";
import { useAsyncAction } from "../shared/useAsyncAction";

type NoteHistoryDialogProps = {
  note: LiveNote;
  repository: NoteRepository;
  onRestored: (restoredNoteId: string) => void;
  onClose: () => void;
};

export function NoteHistoryDialog({ note, repository, onRestored, onClose }: NoteHistoryDialogProps) {
  // 読み込むまでは null。
  const [versions, setVersions] = useState<NoteVersion[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  useEffect(() => {
    void repository.noteVersions(note.id).then((loaded) => {
      setVersions(loaded);
      setSelectedId(loaded[0]?.id ?? null);
    });
  }, [repository, note.id]);
  const selected = versions?.find((version) => version.id === selectedId);

  const restore = useAsyncAction(async (version: NoteVersion) => {
    const title = translate("history.restoredTitle", {
      title: version.title || translate("sidebar.untitled"),
      time: formatDateTime(version.updatedAt),
    });
    onRestored((await repository.restoreVersionAsNewNote({ noteId: note.id, versionId: version.id, title })).id);
  });

  return (
    <div className="dialog-backdrop" onPointerDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="dialog note-history" role="dialog" aria-modal="true" aria-label={translate("editor.history")}
        onKeyDown={(event) => event.key === "Escape" && onClose()}>
        <p className="note-history-title">{translate("editor.history")}</p>
        <p className="hint">{translate("history.localOnly")}</p>
        {versions?.length === 0 && <p>{translate("history.empty")}</p>}
        {versions && versions.length > 0 && (
          <div className="note-history-body">
            <div className="note-history-list" role="listbox" aria-label={translate("editor.history")}>
              {versions.map((version) => (
                <button key={version.id} type="button" role="option" aria-selected={version.id === selectedId}
                  className={`menu-item${version.id === selectedId ? " on" : ""}`} onClick={() => setSelectedId(version.id)}>
                  <span>
                    {formatDateTime(version.updatedAt)}
                    <span className="hint">{translate(`history.reason.${version.reason}`)}</span>
                  </span>
                </button>
              ))}
            </div>
            <div className="note-history-preview">
              {selected && (
                <>
                  <strong>{selected.title || translate("sidebar.untitled")}</strong>
                  <pre>{selected.plainText}</pre>
                </>
              )}
            </div>
          </div>
        )}
        {restore.errorMessage && <div className="form-error" role="alert">{restore.errorMessage}</div>}
        <div className="form-actions">
          <button type="button" className="secondary-button" onClick={onClose}>{translate("common.close")}</button>
          {selected && (
            <button type="button" className="primary-button" disabled={restore.busy} onClick={() => void restore.run(selected)}>
              {translate("history.restore")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
