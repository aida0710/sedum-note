// 設定の画面。表示、テーマ、同期先、バックアップ、Markdown、パスフレーズの変更、ゴミ箱、MCP、更新、ロック、データの消去を並べる。

import { useContext, useState } from "react";
import { MIN_PASSPHRASE_LENGTH } from "../../core/crypto/passphraseKey";
import type { NoteRepository } from "../../core/notes/noteRepository";
import type { RemoteConfig } from "../../core/remote/remoteConfig";
import { describeError } from "../i18n/describeError";
import { translate } from "../i18n/translate";
import { fileNameDate } from "../platform/fileNameDate";
import { BACKUP_FILE_EXTENSION, saveFile } from "../platform/saveFile";
import type { VaultSession } from "../session/useVaultSession";
import { WipeDeviceDataButton } from "../session/WipeDeviceDataButton";
import { CorsGuide } from "../shared/CorsGuide";
import { PassphraseGenerator } from "../shared/PassphraseGenerator";
import { EMPTY_REMOTE_CONFIG, RemoteConfigFields } from "../shared/RemoteConfigFields";
import { checkRemoteConfigInput } from "../shared/remoteConfigProblemMessage";
import { useAsyncAction } from "../shared/useAsyncAction";
import { DisplaySection } from "./DisplaySection";
import { MarkdownSection } from "./MarkdownSection";
import { McpSectionSlot } from "./mcpSectionSlot";
import { ShortcutsSection } from "./ShortcutsSection";
import { ThemeSection } from "./ThemeSection";
import { TrashSection } from "./TrashSection";
import { UpdateSection } from "./UpdateSection";

type SettingsPanelProps = {
  session: VaultSession;
  repository: NoteRepository;
  remoteConfig: RemoteConfig | null;
  unreadableCount: number;
  // スマホの組み方か。キーボードの無い画面には、ショートカットの一覧を出さない。
  isMobile: boolean;
};

export function SettingsPanel({ session, repository, remoteConfig, unreadableCount, isMobile }: SettingsPanelProps) {
  // PC 版では MCP の欄が入っている。Web 版と Android のアプリでは null。
  const mcpSection = useContext(McpSectionSlot);
  return (
    <div className="document-scroll">
      <div className="settings">
        <h1>{translate("settings.title")}</h1>
        {unreadableCount > 0 && <div className="form-error">{translate("settings.unreadable", { count: unreadableCount })}</div>}
        <DisplaySection />
        <ThemeSection />
        <SyncSection session={session} remoteConfig={remoteConfig} />
        <BackupSection session={session} />
        <MarkdownSection repository={repository} />
        <PassphraseSection session={session} />
        {!isMobile && <ShortcutsSection />}
        <TrashSection />
        {mcpSection}
        <UpdateSection repository={repository} />
        <section className="settings-section">
          <h2>{translate("settings.lock")}</h2>
          <p>{translate("settings.lockDescription")}</p>
          <div><button className="secondary-button" onClick={session.lock}>{translate("settings.lock")}</button></div>
        </section>
        <section className="settings-section">
          <h2>{translate("wipe.title")}</h2>
          <p>{translate("wipe.description")}</p>
          <WipeDeviceDataButton session={session} />
        </section>
      </div>
    </div>
  );
}

function SyncSection({ session, remoteConfig }: { session: VaultSession; remoteConfig: RemoteConfig | null }) {
  const [draft, setDraft] = useState<RemoteConfig>(remoteConfig ?? EMPTY_REMOTE_CONFIG);
  const [problem, setProblem] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const save = useAsyncAction(session.saveRemoteConfig);
  const syncNow = useAsyncAction(session.syncNow);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaved(false);
    const checked = checkRemoteConfigInput(draft);
    if ("problem" in checked) {
      setProblem(checked.problem);
      return;
    }
    setProblem(null);
    setSaved(await save.run(checked.config));
  };
  const status = session.syncStatus;
  const lastFailure = status?.state === "failed" ? translate("settings.lastSyncFailed", { reason: describeError(status.error) }) : null;
  const message = problem ?? save.errorMessage ?? syncNow.errorMessage ?? lastFailure;
  return (
    <form className="settings-section" onSubmit={submit}>
      <h2>{translate("settings.sync")}</h2>
      <p>{translate("settings.syncDescription")}</p>
      <RemoteConfigFields value={draft} onChange={setDraft} />
      <CorsGuide />
      {message && <div className="form-error" role="alert">{message}</div>}
      <div className="form-actions">
        {saved && <span className="form-success">{translate("settings.syncSaved")}</span>}
        {remoteConfig && (
          <button type="button" className="secondary-button" disabled={syncNow.busy} onClick={() => void syncNow.run(undefined)}>
            {translate("settings.syncNow")}
          </button>
        )}
        <button type="submit" className="primary-button" disabled={save.busy}>{translate("settings.syncSave")}</button>
      </div>
    </form>
  );
}

function BackupSection({ session }: { session: VaultSession }) {
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

function PassphraseSection({ session }: { session: VaultSession }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [changed, setChanged] = useState(false);
  const change = useAsyncAction(session.changePassphrase);
  return (
    <form className="settings-section" onSubmit={async (event) => {
      event.preventDefault();
      setChanged(false);
      if (await change.run({ current, next })) {
        setChanged(true);
        setCurrent("");
        setNext("");
      }
    }}>
      <h2>{translate("settings.passphrase")}</h2>
      <div className="field-grid">
        <div className="field">
          <label htmlFor="current-passphrase">{translate("settings.currentPassphrase")}</label>
          <input id="current-passphrase" type="password" value={current} onChange={(event) => setCurrent(event.target.value)} autoComplete="current-password" required />
        </div>
        <div className="field">
          <label htmlFor="new-passphrase">{translate("settings.newPassphrase")}</label>
          <input id="new-passphrase" type="password" value={next} onChange={(event) => setNext(event.target.value)} autoComplete="new-password" required />
          <span className="hint">{translate("setup.passphraseHint", { minimum: MIN_PASSPHRASE_LENGTH })}</span>
        </div>
      </div>
      <PassphraseGenerator passphrase={next} onGenerate={setNext} />
      {change.errorMessage && <div className="form-error" role="alert">{change.errorMessage}</div>}
      <div className="form-actions">
        {changed && <span className="form-success">{translate("settings.passphraseChanged")}</span>}
        <button type="submit" className="secondary-button" disabled={change.busy}>{translate("settings.passphrase")}</button>
      </div>
    </form>
  );
}
