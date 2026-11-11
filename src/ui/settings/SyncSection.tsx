// 設定の「同期」の欄。同期先の設定（接続を確認してから保存）、自動の同期の入り切り、今すぐ同期、状態の表示。

import { useState } from "react";
import type { SyncStatus } from "../../core/sync/autoSync";
import type { SyncTargetCheck } from "../../core/vault/syncTarget";
import type { UnlockedVault } from "../../core/vault/vaultSession";
import { describeError } from "../i18n/describeError";
import { translate } from "../i18n/translate";
import { updateDevicePreferences, useDevicePreferences } from "../preferences/devicePreferences";
import type { VaultSession } from "../session/useVaultSession";
import { formatDateTime } from "../shared/formatTime";
import { useAsyncAction } from "../shared/useAsyncAction";
import { SyncTargetFields } from "../sync/SyncTargetFields";
import { useSyncTargetForm } from "../sync/useSyncTargetForm";
import { SyncKeySection } from "./SyncKeySection";

type SyncSectionProps = { session: VaultSession; vault: UnlockedVault };

export function SyncSection({ session, vault }: SyncSectionProps) {
  const { remoteConfig } = vault;
  const form = useSyncTargetForm(session, remoteConfig);
  const [passphrase, setPassphrase] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const save = useAsyncAction(session.connectSyncTarget);
  const placesNewVault = form.checked?.inspected.state === "empty";

  // 確かめた同期先が、このデバイスのメモと同じ vault のものか。
  const isOwnVault = (checked: SyncTargetCheck) => checked.inspected.state === "existing" && checked.inspected.vaultId === vault.vaultId;
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaved(false);
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
      setSaved(true);
      setPassphrase("");
    }
  };
  const message = problem ?? save.errorMessage;
  return (
    <>
      <form className="settings-section" onSubmit={submit}>
        <h2>{translate("settings.sync")}</h2>
        <p>{translate("settings.syncDescription")}</p>
        {remoteConfig && <SyncOverview session={session} />}
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
          {saved && <span className="form-success">{translate("settings.syncSaved")}</span>}
          <button type="submit" className="primary-button" disabled={save.busy || form.checked === null}>{translate("settings.syncSave")}</button>
        </div>
      </form>
      {remoteConfig && <SyncKeySection session={session} remoteConfig={remoteConfig} />}
    </>
  );
}

// 自動の同期の入り切りと、今の状態、「今すぐ同期」。
function SyncOverview({ session }: { session: VaultSession }) {
  const { autoSync } = useDevicePreferences();
  const syncNow = useAsyncAction(session.syncNow);
  return (
    <div className="sync-overview">
      <label className="checkbox-line">
        <input type="checkbox" checked={autoSync} onChange={(event) => updateDevicePreferences({ autoSync: event.target.checked })} />
        {translate("settings.autoSync")}
      </label>
      <span className="hint">{translate("settings.autoSyncHint")}</span>
      <SyncStatusDetail status={session.syncStatus} autoSync={autoSync} />
      {syncNow.errorMessage && <div className="form-error" role="alert">{syncNow.errorMessage}</div>}
      <div className="form-actions">
        <button type="button" className="secondary-button" disabled={syncNow.busy} onClick={() => void syncNow.run(undefined)}>
          {translate("settings.syncNow")}
        </button>
      </div>
    </div>
  );
}

function SyncStatusDetail({ status, autoSync }: { status: SyncStatus | null; autoSync: boolean }) {
  if (status === null) {
    return null;
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
      <p className="hint">{lastSynced}</p>
    </>
  );
}
