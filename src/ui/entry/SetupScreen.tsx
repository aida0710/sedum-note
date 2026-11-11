// 初めて開いたときの画面。このデバイスのパスフレーズを決めて始めるか、バックアップから戻す。
// 同期を使うときは、同期先を確かめた結果で、新しく作るか、既存のメモに参加するかが決まる。

import { LockKeyhole } from "lucide-react";
import { useState } from "react";
import { MIN_PASSPHRASE_LENGTH } from "../../core/crypto/passphraseKey";
import type { SyncTargetChoice } from "../../core/vault/vaultSession";
import { translate } from "../i18n/translate";
import type { VaultSession } from "../session/useVaultSession";
import { PassphraseGenerator } from "../shared/PassphraseGenerator";
import { useAsyncAction } from "../shared/useAsyncAction";
import { SyncSetupImport } from "../sync/SyncSetupImport";
import { SyncTargetFields } from "../sync/SyncTargetFields";
import { useSyncTargetForm } from "../sync/useSyncTargetForm";

type SetupMode = "start" | "restore";

type SetupInput =
  | { mode: "start"; passphrase: string; syncTarget: SyncTargetChoice | null }
  | { mode: "restore"; passphrase: string; backupFile: File };

export function SetupScreen({ session }: { session: VaultSession }) {
  const [mode, setMode] = useState<SetupMode>("start");
  const [passphrase, setPassphrase] = useState("");
  const [passphraseConfirm, setPassphraseConfirm] = useState("");
  // 同期は付け足しの機能。最初はこのデバイスだけに保存する形を既定にする。
  const [useSync, setUseSync] = useState(false);
  const syncTargetForm = useSyncTargetForm(session, null);
  const [inputProblem, setInputProblem] = useState<string | null>(null);
  const [backupFile, setBackupFile] = useState<File | null>(null);
  const action = useAsyncAction(async (input: SetupInput) => {
    if (input.mode === "restore") {
      await session.restoreBackup({ file: new Uint8Array(await input.backupFile.arrayBuffer()), passphrase: input.passphrase });
    } else {
      await session.startVault({ passphrase: input.passphrase, syncTarget: input.syncTarget });
    }
  });
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
    if (passphrase !== passphraseConfirm) {
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
      <form className="entry-card" onSubmit={submit}>
        <h1><LockKeyhole size={20} />{translate("setup.title")}</h1>
        <p className="description">{translate("setup.description")}</p>
        <div className="segmented" role="tablist">
          <button type="button" role="tab" aria-selected={mode === "start"} className={mode === "start" ? "on" : ""} onClick={() => setMode("start")}>{translate("setup.mode.start")}</button>
          <button type="button" role="tab" aria-selected={mode === "restore"} className={mode === "restore" ? "on" : ""} onClick={() => setMode("restore")}>{translate("setup.mode.restore")}</button>
        </div>
        {mode === "restore" && (
          <div className="field">
            <label htmlFor="setup-backup-file">{translate("setup.backupFile")}</label>
            <input id="setup-backup-file" type="file" onChange={(event) => setBackupFile(event.target.files?.[0] ?? null)} />
          </div>
        )}
        <div className="field">
          <label htmlFor="setup-passphrase">{translate("setup.passphrase")}</label>
          <input id="setup-passphrase" type="password" value={passphrase} onChange={(event) => setPassphrase(event.target.value)} autoComplete="new-password" required />
          {mode === "start" && <span className="hint">{translate("setup.passphraseHint", { minimum: MIN_PASSPHRASE_LENGTH })}</span>}
          {joins && <span className="hint">{translate("setup.passphraseForThisDevice")}</span>}
          {mode === "restore" && <span className="hint">{translate("setup.backupPassphraseHint")}</span>}
        </div>
        {mode === "start" && (
          <>
            <div className="field">
              <label htmlFor="setup-passphrase-confirm">{translate("setup.passphraseConfirm")}</label>
              <input id="setup-passphrase-confirm" type="password" value={passphraseConfirm} onChange={(event) => setPassphraseConfirm(event.target.value)} autoComplete="new-password" required />
            </div>
            <PassphraseGenerator passphrase={passphrase} onGenerate={(generated) => { setPassphrase(generated); setPassphraseConfirm(generated); }} />
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
          {action.busy && <span className="hint">{translate("setup.working")}</span>}
          {usesSync && syncTargetForm.checked === null && !action.busy && <span className="hint">{translate("syncTarget.checkFirst")}</span>}
          <button className="primary-button" type="submit" disabled={action.busy || (usesSync && syncTargetForm.checked === null)}>
            {translate(mode === "restore" ? "setup.submitRestore" : joins ? "setup.submitJoin" : "setup.submitNew")}
          </button>
        </div>
      </form>
    </div>
  );
}
