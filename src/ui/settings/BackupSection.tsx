// 設定の「バックアップ」の欄。メモ・ノートブック・添付を、暗号化したまま 1 つのファイルに書き出す。

import { useState } from "react";
import { translate } from "../i18n/translate";
import { fileNameDate } from "../platform/fileNameDate";
import { BACKUP_FILE_EXTENSION, saveFile } from "../platform/saveFile";
import type { VaultSession } from "../session/useVaultSession";
import { useAsyncAction } from "../shared/useAsyncAction";

export function BackupSection({ session }: { session: VaultSession }) {
  const [result, setResult] = useState<{ noteCount: number; missingAttachmentCount: number } | null>(null);
  const exportToFile = useAsyncAction(async () => {
    setResult(null);
    const backup = await session.exportBackup();
    const saved = await saveFile({ suggestedName: backupFileName(new Date()), parts: backup.parts, mimeType: "application/octet-stream" });
    if (saved) {
      setResult(backup);
    }
  });
  return (
    <section className="settings-section">
      <h2>{translate("settings.backup")}</h2>
      <p>{translate("settings.backupDescription")}</p>
      {exportToFile.errorMessage && <div className="form-error" role="alert">{exportToFile.errorMessage}</div>}
      {result && result.missingAttachmentCount > 0 && (
        <div className="form-error" role="alert">{translate("settings.backupMissingAttachments", { count: result.missingAttachmentCount })}</div>
      )}
      <div className="form-actions">
        {result && <span className="form-success">{translate("settings.backupExported", { count: result.noteCount })}</span>}
        <button type="button" className="secondary-button" disabled={exportToFile.busy} onClick={() => void exportToFile.run(undefined)}>
          {translate("settings.backupExport")}
        </button>
      </div>
    </section>
  );
}

// 例: sedum-note-backup-20261111.sedumbackup
function backupFileName(now: Date): string {
  return `sedum-note-backup-${fileNameDate(now)}.${BACKUP_FILE_EXTENSION}`;
}
