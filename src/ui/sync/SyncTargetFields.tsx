// 同期先の入力欄、「接続を確認」のボタン、確かめた結果の知らせ、暗号化キーの入力。
// 最初の画面と、設定の同期の欄で使う。

import { isWebDavConfig } from "../../core/remote/remoteConfig";
import type { SyncTargetCheck } from "../../core/vault/syncTarget";
import { translate } from "../i18n/translate";
import { CorsGuide } from "../shared/CorsGuide";
import { RemoteConfigFields } from "../shared/RemoteConfigFields";
import { NewSyncKeyChoice } from "./NewSyncKeyChoice";
import type { SyncTargetForm } from "./useSyncTargetForm";

type SyncTargetFieldsProps = {
  form: SyncTargetForm;
  // 設定の画面（このデバイスに既にメモがある）で使うときに渡す。確かめた既存のメモが、このデバイスのメモと
  // 同じものかを返す。同じなら暗号化キーは要らず、別のものなら同期先にできない。
  isOwnVault?: (check: SyncTargetCheck) => boolean;
};

// 確かめた既存のメモと、このデバイスとの関係。
type ExistingVaultRelation = "join" | "own" | "other";

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
      {checked && <SyncTargetResult form={form} checked={checked} relation={isOwnVault === undefined ? "join" : isOwnVault(checked) ? "own" : "other"} />}
    </>
  );
}

function SyncTargetResult({ form, checked, relation }: { form: SyncTargetForm; checked: SyncTargetCheck; relation: ExistingVaultRelation }) {
  const { inspected } = checked;
  if (inspected.state === "incomplete") {
    return <div className="form-error" role="alert">{translate("syncTarget.incomplete")}</div>;
  }
  if (inspected.state === "existing" && relation === "other") {
    return <div className="form-error" role="alert">{translate("syncTarget.otherVault")}</div>;
  }
  if (inspected.state === "existing") {
    return (
      <div className="sync-target-result" role="status">
        <p className="form-notice">
          {checked.foundFolderAutomatically && !isWebDavConfig(checked.remoteConfig)
            ? translate("syncTarget.existingInFoundFolder", { folder: checked.remoteConfig.prefix })
            : translate("syncTarget.existing")}
        </p>
        {relation === "own" ? <p className="hint">{translate("syncTarget.ownVault")}</p> : (
          <div className="field">
            <label htmlFor="sync-key">{translate("syncTarget.syncKey")}</label>
            <input id="sync-key" type="password" value={form.existingSyncKey} onChange={(event) => form.setExistingSyncKey(event.target.value)}
              autoComplete="off" autoCapitalize="off" spellCheck={false} />
            <span className="hint">{translate("syncTarget.syncKeyHint")}</span>
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
          {/* 見つけた場所は全部並べる（多ければ、枠の中で送る）。確かめている間は、続けて押せないようにする。 */}
          <div className="found-folder-list">
            {checked.otherVaultFolders.map((folder) => {
              const label = translate("syncTarget.useFolder", { folder: folder === "" ? translate("syncTarget.bucketRoot") : folder });
              return (
                <button key={folder} type="button" className="secondary-button" title={label} disabled={form.check.busy} onClick={() => void form.check.run({ folder })}>
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      )}
      <NewSyncKeyChoice inputId="new-sync-key" value={form.newSyncKey} onChange={form.setNewSyncKey} />
    </div>
  );
}
