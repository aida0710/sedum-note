// 設定の「同期」の欄。同期先の設定（接続を確認してから保存）、自動の同期の入り切り、今すぐ同期、状態の表示。

import { isWebDavConfig, type RemoteConfig } from "../../core/remote/remoteConfig";
import { useState } from "react";
import { AppUpdateRequiredError } from "../../core/format/dataFormat";
import type { SyncStatus } from "../../core/sync/autoSync";
import type { SyncTargetCheck } from "../../core/vault/syncTarget";
import type { UnlockedVault } from "../../core/vault/vaultSession";
import { describeError } from "../i18n/describeError";
import { translate } from "../i18n/translate";
import { updateDevicePreferences, useDevicePreferences } from "../preferences/devicePreferences";
import type { VaultSession } from "../session/useVaultSession";
import { formatDateTime } from "../shared/formatTime";
import { useAsyncAction } from "../shared/useAsyncAction";
import { SyncSetupExportDialog } from "../sync/SyncSetupExportDialog";
import { SyncSetupImport } from "../sync/SyncSetupImport";
import { SyncTargetFields } from "../sync/SyncTargetFields";
import { useSyncTargetForm } from "../sync/useSyncTargetForm";
import { SettingCheckboxRow } from "./SettingRow";
import { SyncKeySection } from "./SyncKeySection";
import { preventSubmitByImeKey } from "../shared/imeKeyEvent";
import { useUnsavedSettingsDraft } from "./unsavedSettingsDrafts";

type SyncSectionProps = {
  session: VaultSession;
  vault: UnlockedVault;
  // 設定の「更新」のページを開く。同期の失敗が「アプリの更新が必要」のときに使う。
  onOpenUpdatePage: () => void;
};

export function SyncSection({ session, vault, onOpenUpdatePage }: SyncSectionProps) {
  const { remoteConfig } = vault;
  // 同期先を設定済みなら、入力欄はたたんでおき、「同期先を変更」で開く。
  const [changingTarget, setChangingTarget] = useState(false);
  return (
    <>
      <section className="settings-section">
        <h2>{translate("settings.sync")}</h2>
        <p>{translate("settings.syncDescription")}</p>
        {remoteConfig && <SyncOverview session={session} onOpenUpdatePage={onOpenUpdatePage} />}
        {remoteConfig && !changingTarget ? (
          <>
            <div className="sync-target-summary">
              <span>{describeSyncTarget(remoteConfig)}</span>
              <button type="button" className="secondary-button" onClick={() => setChangingTarget(true)}>{translate("settings.syncChangeTarget")}</button>
            </div>
            <SyncSetupExport session={session} />
          </>
        ) : (
          <SyncTargetEditor session={session} vault={vault} onClose={remoteConfig ? () => setChangingTarget(false) : null} />
        )}
      </section>
      {remoteConfig && <SyncKeySection session={session} />}
    </>
  );
}

type SyncTargetEditorProps = Pick<SyncSectionProps, "session" | "vault"> & {
  // 入力をやめて、たたむ。まだ同期先が無いとき（たたむ先が無い）は null。
  onClose: (() => void) | null;
};

// 同期先を入れて、確かめて、保存する欄。
function SyncTargetEditor({ session, vault, onClose }: SyncTargetEditorProps) {
  const form = useSyncTargetForm(session, vault.remoteConfig);
  const [passphrase, setPassphrase] = useState("");
  // 入れ始めたときの同期先と違うか、確かめた結果か暗号化キーかパスフレーズを入れていれば、打ちかけ。
  const [initialRemoteConfig] = useState(form.remoteConfig);
  useUnsavedSettingsDraft("syncTarget", JSON.stringify(form.remoteConfig) !== JSON.stringify(initialRemoteConfig) || form.checked !== null || passphrase !== "");
  const [problem, setProblem] = useState<string | null>(null);
  const save = useAsyncAction(session.connectSyncTarget);
  const placesNewVault = form.checked?.inspected.state === "empty";
  // 確かめた同期先が、このデバイスのメモと同じ vault のものか。
  const isOwnVault = (checked: SyncTargetCheck) => checked.inspected.state === "existing" && checked.inspected.vaultId === vault.vaultId;
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const { checked } = form;
    // 同じメモの同期先へつなぎ直すときは、暗号化キーは要らない（マスターキーは手元にある）。
    const choice = checked !== null && isOwnVault(checked)
      ? { syncTarget: { remoteConfig: checked.remoteConfig, inspected: checked.inspected, syncKey: null } }
      : form.resolveChoice();
    if ("problem" in choice) {
      setProblem(choice.problem);
      return;
    }
    setProblem(null);
    if (await save.run({ syncTarget: choice.syncTarget, passphrase: placesNewVault ? passphrase : null })) {
      onClose?.();
    }
  };
  // 別のメモがある場所は、同期先にできない（知らせは SyncTargetFields が出す）。
  const holdsOtherVault = form.checked?.inspected.state === "existing" && !isOwnVault(form.checked);
  const message = problem ?? save.errorMessage;
  return (
    <>
      {/* 取り込みの欄は form の外に置く（暗号化キーの欄の Enter で、下の「保存」が送られないように）。 */}
      <SyncSetupImport form={form} />
    <form className="sync-target-editor" onKeyDown={preventSubmitByImeKey} onSubmit={submit}>
      <SyncTargetFields form={form} isOwnVault={isOwnVault} />
      {placesNewVault && (
        <div className="field">
          <label htmlFor="sync-passphrase">{translate("settings.syncPassphrase")}</label>
          <input id="sync-passphrase" type="password" value={passphrase} onChange={(event) => setPassphrase(event.target.value)} autoComplete="current-password" required />
          <span className="hint">{translate("settings.syncPassphraseHint")}</span>
        </div>
      )}
      {message && <div className="form-error" role="alert">{message}</div>}
      <div className="form-actions">
        {form.checked === null && <span className="hint">{translate("syncTarget.checkFirst")}</span>}
        {onClose && <button type="button" className="secondary-button" onClick={onClose}>{translate("common.cancel")}</button>}
        <button type="submit" className="primary-button" disabled={save.busy || form.checked === null || holdsOtherVault}>{translate("settings.syncSave")}</button>
      </div>
    </form>
    </>
  );
}

// ほかのデバイスを加えるための、同期の設定の書き出し（QR とファイル）。
function SyncSetupExport({ session }: { session: VaultSession }) {
  const [setup, setSetup] = useState<string | null>(null);
  const exportSetup = useAsyncAction(async () => setSetup(await session.exportSyncSetup()));
  return (
    <div className="sync-setup-export-entry">
      <span className="hint">{translate("syncSetup.exportHint")}</span>
      {exportSetup.errorMessage && <div className="form-error" role="alert">{exportSetup.errorMessage}</div>}
      <div className="form-actions">
        <button type="button" className="secondary-button" disabled={exportSetup.busy} onClick={() => void exportSetup.run(undefined)}>{translate("syncSetup.export")}</button>
      </div>
      {setup !== null && <SyncSetupExportDialog setup={setup} onClose={() => setSetup(null)} />}
    </div>
  );
}

function describeSyncTarget(remoteConfig: RemoteConfig): string {
  if (isWebDavConfig(remoteConfig)) {
    return translate("settings.syncTargetWebDav", { url: remoteConfig.url });
  }
  return translate("settings.syncTarget", { bucket: remoteConfig.bucket, folder: remoteConfig.prefix === "" ? translate("syncTarget.bucketRoot") : remoteConfig.prefix });
}

// 自動の同期の入り切りと、今の状態、「今すぐ同期」。
function SyncOverview({ session, onOpenUpdatePage }: Pick<SyncSectionProps, "session" | "onOpenUpdatePage">) {
  const { autoSync } = useDevicePreferences();
  const syncNow = useAsyncAction(session.syncNow);
  return (
    <div className="sync-overview">
      <SettingCheckboxRow controlId="sync-auto-sync" label={translate("settings.autoSync")} hint={translate("settings.autoSyncHint")} checked={autoSync}
        onChange={(enabled) => updateDevicePreferences({ autoSync: enabled })} />
      <SyncStatusDetail status={session.syncStatus} autoSync={autoSync} onOpenUpdatePage={onOpenUpdatePage} />
      {syncNow.errorMessage && <div className="form-error" role="alert">{syncNow.errorMessage}</div>}
      <div className="form-actions">
        <button type="button" className="secondary-button" disabled={syncNow.busy || session.syncStatus?.state === "delegated"} onClick={() => void syncNow.run(undefined)}>
          {translate("settings.syncNow")}
        </button>
      </div>
    </div>
  );
}

type SyncStatusDetailProps = { status: SyncStatus | null; autoSync: boolean; onOpenUpdatePage: () => void };

function SyncStatusDetail({ status, autoSync, onOpenUpdatePage }: SyncStatusDetailProps) {
  if (status === null) {
    return null;
  }
  if (status.state === "delegated") {
    return <p className="hint" role="status">{translate("settings.syncDelegated")}</p>;
  }
  const lastSynced = status.lastSyncedAt === null
    ? translate("sync.never")
    : translate("settings.lastSyncedAt", { time: formatDateTime(status.lastSyncedAt.toISOString()) });
  if (status.state !== "failed") {
    return <p className="hint" role="status">{lastSynced}</p>;
  }
  // 直らない失敗で止めているのか、次の自動の同期でやり直すのかを言い分ける。
  const next = status.willRetry ? translate("settings.syncWillRetry") : autoSync ? translate("settings.syncStopped") : "";
  return (
    <>
      <div className="form-error" role="alert">{translate("settings.lastSyncFailed", { reason: describeError(status.error) })} {next}</div>
      {/* 「アプリを更新してください」と言うだけで終わらせず、更新のページへのボタンを添える。 */}
      {status.error instanceof AppUpdateRequiredError && (
        <div><button type="button" className="secondary-button" onClick={onOpenUpdatePage}>{translate("settings.syncOpenUpdatePage")}</button></div>
      )}
      <p className="hint">{lastSynced}</p>
    </>
  );
}
