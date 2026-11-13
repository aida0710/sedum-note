// 設定: アプリのバージョンと更新。

import { useContext } from "react";
import type { NoteRepository } from "../../core/notes/noteRepository";
import { translate } from "../i18n/translate";
import { openExternalUrl } from "../platform/openExternalUrl";
import { isRunningInTauri } from "../platform/runtime";
import { updateDevicePreferences, useDevicePreferences } from "../preferences/devicePreferences";
import { useAsyncAction } from "../shared/useAsyncAction";
import { APP_VERSION } from "../update/appVersion";
import type { AvailableUpdate } from "../update/availableUpdate";
import { AvailableUpdateContext } from "../update/useAvailableUpdate";
import { SettingCheckboxRow } from "./SettingRow";

export function UpdateSection({ repository }: { repository: NoteRepository }) {
  const { checkForUpdates } = useDevicePreferences();
  const availableUpdate = useContext(AvailableUpdateContext);
  return (
    <section className="settings-section">
      <h2>{translate("settings.update")}</h2>
      <p>{translate("update.currentVersion", { version: APP_VERSION })}</p>
      {/* Web 版は、開くたびに最新のものが届くので、確かめる設定を出さない。 */}
      {isRunningInTauri() && (
        <SettingCheckboxRow controlId="update-check-on-start" label={translate("update.checkOnStart")} hint={translate("update.checkDescription")}
          checked={checkForUpdates} onChange={(enabled) => updateDevicePreferences({ checkForUpdates: enabled })} />
      )}
      {availableUpdate && <AvailableUpdateActions availableUpdate={availableUpdate} repository={repository} />}
    </section>
  );
}

function AvailableUpdateActions({ availableUpdate, repository }: { availableUpdate: AvailableUpdate; repository: NoteRepository }) {
  const { installAndRelaunch } = availableUpdate;
  const install = useAsyncAction(async () => {
    // 入れ替えるとアプリが終わるので、保存を待っている入力を先に書く。
    await repository.flush();
    await installAndRelaunch?.();
  });
  const openReleasePage = useAsyncAction(() => openExternalUrl(availableUpdate.releasePageUrl));
  const errorMessage = install.errorMessage ?? openReleasePage.errorMessage;
  return (
    <>
      <div className="notice">{translate("update.available", { version: availableUpdate.version })}</div>
      {errorMessage && <div className="form-error" role="alert">{errorMessage}</div>}
      <div className="form-actions">
        {install.busy && <span className="hint">{translate("update.installing")}</span>}
        <button type="button" className="secondary-button" onClick={() => void openReleasePage.run(undefined)}>{translate("update.openReleasePage")}</button>
        {installAndRelaunch && (
          <button type="button" className="primary-button" disabled={install.busy} onClick={() => void install.run(undefined)}>
            {translate("update.installAndRelaunch")}
          </button>
        )}
      </div>
    </>
  );
}
