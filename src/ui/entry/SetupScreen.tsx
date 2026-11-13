// 初めて開いたときの画面。このデバイスのパスフレーズを決めて始めるか、バックアップから戻す。
// 同期を使うときは、同期先を確かめた結果で、新しく作るか、既存のメモに参加するかが決まる。

import { useRef, useState } from "react";
import { MIN_PASSPHRASE_LENGTH } from "../../core/crypto/passphraseKey";
import type { SyncTargetChoice } from "../../core/vault/vaultSession";
import { translate } from "../i18n/translate";
import { spaceDisplayName } from "../session/spaceDisplayName";
import { removeSpaceFromRegistry, useSpaceRegistry } from "../session/spaceRegistry";
import { destroySpaceData } from "../session/spaceVaults";
import type { VaultSession } from "../session/useVaultSession";
import { EntryBrand } from "./EntryBrand";
import { BACKUP_FILE_EXTENSION } from "../platform/saveFile";
import { PassphraseGenerator } from "../shared/PassphraseGenerator";
import { ProgressStatus } from "../shared/ProgressStatus";
import { useAsyncAction } from "../shared/useAsyncAction";
import { SyncSetupImport } from "../sync/SyncSetupImport";
import { SyncTargetFields } from "../sync/SyncTargetFields";
import { useSyncTargetForm } from "../sync/useSyncTargetForm";
import { preventSubmitByImeKey } from "../shared/imeKeyEvent";

type SetupMode = "start" | "restore";

// バックアップのファイル選択で選べる種類。拡張子を知らない選択の画面（Android など）でも選べるよう、書き出すときの種類も並べる。
const BACKUP_FILE_ACCEPT = `.${BACKUP_FILE_EXTENSION},application/octet-stream`;

type SetupInput =
  | { mode: "start"; passphrase: string; syncTarget: SyncTargetChoice | null }
  | { mode: "restore"; passphrase: string; backupFile: File };

export function SetupScreen({ session, spaceId }: { session: VaultSession; spaceId: string }) {
  // 足したスペースの最初の設定か。パスフレーズは、ほかのスペースと同じものを入れる（確認の欄と、生成は出さない）。
  const { spaces } = useSpaceRegistry();
  const addedSpace = spaces.length > 1 ? spaces.find((space) => space.id === spaceId) ?? null : null;
  const cancelAddedSpace = useAsyncAction(async () => {
    await destroySpaceData(spaceId);
    removeSpaceFromRegistry(spaceId);
  });
  const [mode, setMode] = useState<SetupMode>("start");
  const [passphrase, setPassphrase] = useState("");
  const [passphraseConfirm, setPassphraseConfirm] = useState("");
  // 同期は付け足しの機能。最初はこのデバイスだけに保存する形を既定にする。
  const [useSync, setUseSync] = useState(false);
  const syncTargetForm = useSyncTargetForm(session, null);
  const [inputProblem, setInputProblem] = useState<string | null>(null);
  const [backupFile, setBackupFile] = useState<File | null>(null);
  const backupFileInput = useRef<HTMLInputElement>(null);
  const action = useAsyncAction(async (input: SetupInput, { reportProgress }) => {
    if (input.mode === "restore") {
      await session.restoreBackup({ file: new Uint8Array(await input.backupFile.arrayBuffer()), passphrase: input.passphrase, reportProgress });
    } else {
      await session.startVault({ passphrase: input.passphrase, syncTarget: input.syncTarget });
    }
  });
  // 「始める」と「バックアップから戻す」を切り替えたら、前の画面で出た誤り（確認のパスフレーズの不一致など）は消す。
  const chooseMode = (nextMode: SetupMode) => {
    setMode(nextMode);
    setInputProblem(null);
    action.clearError();
  };
  const usesSync = mode === "start" && useSync;
  const joins = usesSync && syncTargetForm.checked?.inspected.state === "existing";

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setInputProblem(null);
    if (mode === "restore") {
      if (backupFile === null) {
        setInputProblem(translate("setup.backupFileMissing"));
        return;
      }
      void action.run({ mode, passphrase, backupFile });
      return;
    }
    if (addedSpace === null && passphrase !== passphraseConfirm) {
      setInputProblem(translate("setup.passphraseMismatch"));
      return;
    }
    if (!usesSync) {
      void action.run({ mode, passphrase, syncTarget: null });
      return;
    }
    const choice = syncTargetForm.resolveChoice();
    if ("problem" in choice) {
      setInputProblem(choice.problem);
      return;
    }
    void action.run({ mode, passphrase, syncTarget: choice.syncTarget });
  };

  const message = inputProblem ?? action.errorMessage;
  return (
    <div className="entry">
      <form className="entry-card" onKeyDown={preventSubmitByImeKey} onSubmit={submit}>
        <EntryBrand />
        <h1>{addedSpace ? translate("space.setupTitle", { name: spaceDisplayName(addedSpace) }) : translate("setup.title")}</h1>
        <p className="description">{translate(addedSpace ? "space.setupDescription" : "setup.description")}</p>
        <div className="segmented" role="tablist">
          <button type="button" role="tab" aria-selected={mode === "start"} className={mode === "start" ? "on" : ""} onClick={() => chooseMode("start")}>{translate("setup.mode.start")}</button>
          <button type="button" role="tab" aria-selected={mode === "restore"} className={mode === "restore" ? "on" : ""} onClick={() => chooseMode("restore")}>{translate("setup.mode.restore")}</button>
        </div>
        {mode === "restore" && (
          <div className="field">
            <label htmlFor="setup-backup-file">{translate("setup.backupFile")}</label>
            {/* ブラウザの既定のファイル選択は、見た目も言葉（英語の「Choose File」）もアプリとそろわないので、隠してボタンから開く。 */}
            <div className="file-choice">
              <button type="button" className="secondary-button" onClick={() => backupFileInput.current?.click()}>{translate("setup.chooseBackupFile")}</button>
              <span className="file-choice-name" title={backupFile?.name}>{backupFile?.name ?? translate("setup.noBackupFileChosen")}</span>
            </div>
            <input ref={backupFileInput} id="setup-backup-file" type="file" accept={BACKUP_FILE_ACCEPT} hidden onChange={(event) => setBackupFile(event.target.files?.[0] ?? null)} />
          </div>
        )}
        <div className="field">
          <label htmlFor="setup-passphrase">{translate("setup.passphrase")}</label>
          <input id="setup-passphrase" type="password" value={passphrase} onChange={(event) => setPassphrase(event.target.value)} autoComplete="new-password" required />
          {mode === "start" && addedSpace === null && <span className="hint">{translate("setup.passphraseHint", { minimum: MIN_PASSPHRASE_LENGTH })}</span>}
          {addedSpace !== null && <span className="hint">{translate("space.passphraseHint")}</span>}
          {joins && <span className="hint">{translate("setup.passphraseForThisDevice")}</span>}
          {mode === "restore" && <span className="hint">{translate("setup.backupPassphraseHint")}</span>}
        </div>
        {mode === "start" && (
          <>
            {addedSpace === null && (
              <>
                <div className="field">
                  <label htmlFor="setup-passphrase-confirm">{translate("setup.passphraseConfirm")}</label>
                  <input id="setup-passphrase-confirm" type="password" value={passphraseConfirm} onChange={(event) => setPassphraseConfirm(event.target.value)} autoComplete="new-password" required />
                </div>
                <PassphraseGenerator passphrase={passphrase} onGenerate={(generated) => { setPassphrase(generated); setPassphraseConfirm(generated); }} />
              </>
            )}
            <div className="field">
              <label className="checkbox-line">
                <input type="checkbox" checked={useSync} onChange={(event) => setUseSync(event.target.checked)} />
                {translate("setup.useSync")}
              </label>
              <span className="hint">{translate("setup.useSyncHint")}</span>
            </div>
          </>
        )}
        {usesSync && <SyncSetupImport form={syncTargetForm} />}
        {usesSync && <SyncTargetFields form={syncTargetForm} />}
        {message && <div className="form-error" role="alert">{message}</div>}
        <div className="form-actions">
          {action.busy && (mode === "restore"
            ? <ProgressStatus label={translate("setup.restoring")} progress={action.progress} />
            : <span className="hint">{translate("setup.working")}</span>)}
          {usesSync && syncTargetForm.checked === null && !action.busy && <span className="hint">{translate("syncTarget.checkFirst")}</span>}
          {addedSpace !== null && (
            <button type="button" className="secondary-button" disabled={action.busy || cancelAddedSpace.busy} onClick={() => void cancelAddedSpace.run(undefined)}>
              {translate("space.cancelAdding")}
            </button>
          )}
          <button className="primary-button" type="submit" disabled={action.busy || (usesSync && syncTargetForm.checked === null)}>
            {translate(mode === "restore" ? "setup.submitRestore" : joins ? "setup.submitJoin" : "setup.submitNew")}
          </button>
        </div>
      </form>
    </div>
  );
}
