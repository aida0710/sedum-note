// 設定: アプリのバージョンと更新。

import { useContext } from "react";
import type { NoteRepository } from "../../core/notes/noteRepository";
import { translate } from "../i18n/translate";
import { openExternalUrl } from "../platform/openExternalUrl";
import { isRunningInTauri } from "../platform/runtime";
import { updateDevicePreferences, useDevicePreferences } from "../preferences/devicePreferences";
import { formatDateTime } from "../shared/formatTime";
import { useAsyncAction } from "../shared/useAsyncAction";
import { APP_VERSION } from "../update/appVersion";
import type { AvailableUpdate } from "../update/availableUpdate";
import type { UpdateCheckState } from "../update/updateChecks";
import { availableUpdateOf, UpdateCheckContext } from "../update/useUpdateCheck";
import { SettingCheckboxRow } from "./SettingRow";

export function UpdateSection({ repository }: { repository: NoteRepository }) {
  const { checkForUpdates } = useDevicePreferences();
  const updateCheck = useContext(UpdateCheckContext);
  const availableUpdate = availableUpdateOf(updateCheck);
  return (
    <section className="settings-section">
      <h2>{translate("settings.update")}</h2>
      <p>{translate("update.currentVersion", { version: APP_VERSION })}</p>
      <div className="update-check">
        <button type="button" className="secondary-button" disabled={updateCheck.checking} onClick={updateCheck.checkNow}>
          {translate("update.checkNow")}
        </button>
        <UpdateCheckStatus updateCheck={updateCheck} />
      </div>
      {updateCheck.last?.result.kind === "failed" && !updateCheck.checking && (
        <div className="form-error" role="alert">{translate("update.checkFailed", { time: formatDateTime(updateCheck.last.checkedAt.toISOString()) })}</div>
      )}
      {availableUpdate && <AvailableUpdateActions availableUpdate={availableUpdate} repository={repository} />}
      <p className="hint">{translate("update.checkDescription")}</p>
      {/* Web 版は、開くたびに最新のものが届くので、自分から確かめる設定を出さない。 */}
      {isRunningInTauri() && (
        <SettingCheckboxRow controlId="update-check-on-start" label={translate("update.checkOnStart")}
          checked={checkForUpdates} onChange={(enabled) => updateDevicePreferences({ checkForUpdates: enabled })} />
      )}
    </section>
  );
}

// 確かめている間と、最新だったとき。見つかったときと確かめられなかったときは、ボタンの下に別に出す。
function UpdateCheckStatus({ updateCheck }: { updateCheck: UpdateCheckState }) {
  if (updateCheck.checking) {
    return <span role="status">{translate("update.checking")}</span>;
  }
  if (updateCheck.last?.result.kind === "upToDate") {
    return <span role="status">{translate("update.upToDate", { time: formatDateTime(updateCheck.last.checkedAt.toISOString()) })}</span>;
  }
  return null;
}

type UpdateInPlace = {
  label: string;
  // 押してから終わるまでに出す文。すぐ終わるものは null。
  busyHint: string | null;
  run: () => Promise<void>;
};

// その場で新しいバージョンにする操作。アプリは入れ替えて再起動し、Web 版はページを読み込み直す（置いてある最新のものが届く）。
// アプリが自分を更新できない環境（Android など）では null。
function updateInPlaceOf(availableUpdate: AvailableUpdate): UpdateInPlace | null {
  if (!isRunningInTauri()) {
    return { label: translate("update.reloadToUpdate"), busyHint: null, run: async () => window.location.reload() };
  }
  const { installAndRelaunch } = availableUpdate;
  return installAndRelaunch && { label: translate("update.installAndRelaunch"), busyHint: translate("update.installing"), run: installAndRelaunch };
}

function AvailableUpdateActions({ availableUpdate, repository }: { availableUpdate: AvailableUpdate; repository: NoteRepository }) {
  const updateInPlace = updateInPlaceOf(availableUpdate);
  const install = useAsyncAction(async () => {
    // 入れ替えるとアプリが終わる（Web 版は読み込み直す）ので、保存を待っている入力を先に書く。
    await repository.flush();
    await updateInPlace?.run();
  });
  const openReleasePage = useAsyncAction(() => openExternalUrl(availableUpdate.releasePageUrl));
  const errorMessage = install.errorMessage ?? openReleasePage.errorMessage;
  return (
    <>
      <div className="notice">{translate("update.available", { version: availableUpdate.version })}</div>
      {errorMessage && <div className="form-error" role="alert">{errorMessage}</div>}
      <div className="form-actions">
        {install.busy && updateInPlace?.busyHint && <span className="hint">{updateInPlace.busyHint}</span>}
        <button type="button" className="secondary-button" onClick={() => void openReleasePage.run(undefined)}>{translate("update.openReleasePage")}</button>
        {updateInPlace && (
          <button type="button" className="primary-button" disabled={install.busy} onClick={() => void install.run(undefined)}>
            {updateInPlace.label}
          </button>
        )}
      </div>
    </>
  );
}
