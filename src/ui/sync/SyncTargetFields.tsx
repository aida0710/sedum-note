// 同期先の入力欄、「接続を確認」のボタン、確かめた結果の知らせ、暗号化キーの入力。
// 最初の画面と、設定の同期の欄で使う。

import type { SyncTargetCheck } from "../../core/vault/syncTarget";
import { MIN_SYNC_KEY_LENGTH } from "../../core/vault/vaultDocument";
import { translate } from "../i18n/translate";
import { CorsGuide } from "../shared/CorsGuide";
import { RemoteConfigFields } from "../shared/RemoteConfigFields";
import type { SyncTargetForm } from "./useSyncTargetForm";

type SyncTargetFieldsProps = {
  form: SyncTargetForm;
  // 既存のメモが、このデバイスのメモと同じものか（設定の画面で、つなぎ直すとき）。同じなら、暗号化キーは要らない。
  isOwnVault?: (check: SyncTargetCheck) => boolean;
};

export function SyncTargetFields({ form, isOwnVault }: SyncTargetFieldsProps) {
  const { checked } = form;
  const message = form.inputProblem ?? form.check.errorMessage;
  return (
    <>
      <RemoteConfigFields value={form.remoteConfig} onChange={form.changeRemoteConfig} />
      <CorsGuide />
      {message && <div className="form-error" role="alert">{message}</div>}
      <div className="form-actions">
        {form.check.busy && <span className="hint">{translate("syncTarget.checking")}</span>}
        <button type="button" className="secondary-button" disabled={form.check.busy} onClick={() => void form.check.run({})}>
          {translate("syncTarget.check")}
        </button>
      </div>
      {checked && <SyncTargetResult form={form} checked={checked} ownVault={isOwnVault?.(checked) ?? false} />}
    </>
  );
}

function SyncTargetResult({ form, checked, ownVault }: { form: SyncTargetForm; checked: SyncTargetCheck; ownVault: boolean }) {
  const { inspected } = checked;
  if (inspected.state === "incomplete") {
    return <div className="form-error" role="alert">{translate("syncTarget.incomplete")}</div>;
  }
  if (inspected.state === "existing") {
    const legacy = inspected.keyWrapping === "passphrase";
    return (
      <div className="sync-target-result" role="status">
        <p className="form-notice">
          {checked.foundFolderAutomatically
            ? translate("syncTarget.existingInFoundFolder", { folder: checked.remoteConfig.prefix })
            : translate("syncTarget.existing")}
        </p>
        {ownVault ? <p className="hint">{translate("syncTarget.ownVault")}</p> : (
          <div className="field">
            <label htmlFor="sync-key">{translate(legacy ? "syncTarget.legacyPassphrase" : "syncTarget.syncKey")}</label>
            <input id="sync-key" type="password" value={form.syncKey} onChange={(event) => form.setSyncKey(event.target.value)} autoComplete="off" spellCheck={false} />
            <span className="hint">{translate(legacy ? "syncTarget.legacyPassphraseHint" : "syncTarget.syncKeyHint")}</span>
          </div>
        )}
      </div>
    );
  }
  return (
    <div className="sync-target-result" role="status">
      <p className="form-notice">{translate("syncTarget.empty")}</p>
      {checked.otherVaultFolders.length > 0 && (
        <div className="found-folders">
          <p className="hint">{translate("syncTarget.foundElsewhere")}</p>
          {checked.otherVaultFolders.map((folder) => (
            <button key={folder} type="button" className="secondary-button" onClick={() => void form.check.run({ folder })}>
              {translate("syncTarget.useFolder", { folder: folder === "" ? translate("syncTarget.bucketRoot") : folder })}
            </button>
          ))}
        </div>
      )}
      <label className="checkbox-line">
        <input type="checkbox" checked={form.choosesOwnSyncKey} onChange={(event) => form.setChoosesOwnSyncKey(event.target.checked)} />
        {translate("syncTarget.chooseOwnKey")}
      </label>
      {form.choosesOwnSyncKey ? (
        <div className="field">
          <label htmlFor="sync-key">{translate("syncTarget.syncKey")}</label>
          <input id="sync-key" type="password" value={form.syncKey} onChange={(event) => form.setSyncKey(event.target.value)} autoComplete="off" spellCheck={false} />
          <span className="hint">{translate("syncTarget.ownKeyHint", { minimum: MIN_SYNC_KEY_LENGTH })}</span>
        </div>
      ) : <p className="hint">{translate("syncTarget.keyWillBeGenerated")}</p>}
    </div>
  );
}
