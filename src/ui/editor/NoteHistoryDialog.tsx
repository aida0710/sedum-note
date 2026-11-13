// メモの履歴を見て、選んだ版の中身にそのメモを戻すダイアログ。戻す前の状態は履歴に残るので、戻す前には確かめない。

import { useEffect, useState } from "react";
import type { LiveNote } from "../../core/notes/noteRecords";
import type { NoteRepository } from "../../core/notes/noteRepository";
import type { NoteVersion } from "../../core/notes/noteVersions";
import { translate } from "../i18n/translate";
import { moveFocusAmongItems } from "../shared/arrowKeyFocus";
import { formatDateTime } from "../shared/formatTime";
import { ModalDialog } from "../shared/ModalDialog";
import { useToast } from "../shared/ToastProvider";
import { ProgressStatus } from "../shared/ProgressStatus";
import { useAsyncAction } from "../shared/useAsyncAction";

type NoteHistoryDialogProps = {
  note: LiveNote;
  repository: NoteRepository;
  onClose: () => void;
};

export function NoteHistoryDialog({ note, repository, onClose }: NoteHistoryDialogProps) {
  const showToast = useToast();
  // 読み込むまでは null。
  const [versions, setVersions] = useState<NoteVersion[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // ほかのデバイスが残した履歴を、同期先から取ってこられなかった（オフラインなど）。手元にある分だけを出している。
  const [remoteUnavailable, setRemoteUnavailable] = useState(false);
  // 同期先の版を取ってくる間（同期していなければすぐ終わる）。
  const [downloading, setDownloading] = useState(true);
  useEffect(() => {
    let closed = false;
    const showVersions = async () => {
      const loaded = await repository.noteVersions(note.id);
      if (!closed) {
        setVersions(loaded);
        setSelectedId((current) => (loaded.some((version) => version.id === current) ? current : loaded[0]?.id ?? null));
      }
    };
    // まず手元にある分を出し、同期先の分が届いたら出し直す。
    void showVersions()
      .then(() => repository.downloadNoteVersions(note.id))
      .then(showVersions, () => !closed && setRemoteUnavailable(true))
      .finally(() => !closed && setDownloading(false));
    return () => {
      closed = true;
    };
  }, [repository, note.id]);
  const selected = versions?.find((version) => version.id === selectedId);

  const restore = useAsyncAction(async (version: NoteVersion) => {
    await repository.restoreNoteToVersion({ noteId: note.id, versionId: version.id });
    onClose();
    showToast({ message: translate("history.restored") });
  });

  return (
    <ModalDialog label={translate("editor.history")} title={translate("editor.history")} description={translate("history.description")} className="note-history" onClose={onClose}>
        {remoteUnavailable && <div className="form-error" role="alert">{translate("history.remoteUnavailable")}</div>}
        {versions?.length === 0 && <p>{translate("history.empty")}</p>}
        {versions && versions.length > 0 && (
          <div className="note-history-body">
            {/* ↑ ↓ Home End で版を移り、移った版の中身を右に出す（フォーカスした版を選ぶ）。Tab で止まるのは選んでいる版だけ。 */}
            <div className="note-history-list" role="listbox" aria-label={translate("editor.history")} onKeyDown={(event) => moveFocusAmongItems(event, "[role=option]")}>
              {versions.map((version) => (
                <button key={version.id} type="button" role="option" aria-selected={version.id === selectedId} tabIndex={version.id === selectedId ? 0 : -1}
                  className={`menu-item${version.id === selectedId ? " on" : ""}`} onClick={() => setSelectedId(version.id)} onFocus={() => setSelectedId(version.id)}>
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
          {downloading && <ProgressStatus label={translate("history.loading")} progress={null} />}
          <button type="button" className="secondary-button" onClick={onClose}>{translate("common.close")}</button>
          {selected && (
            <button type="button" className="primary-button" disabled={restore.busy} onClick={() => void restore.run(selected)}>
              {translate("history.restore")}
            </button>
          )}
        </div>
    </ModalDialog>
  );
}
