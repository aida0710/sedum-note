// 設定: 期限の通知と、ウィンドウを閉じても動かしたままにするか（Windows と Mac のアプリだけ）。

import { translate } from "../i18n/translate";
import { canStayResident, isAndroidApp } from "../platform/runtime";
import { requestNotificationPermission, showNotification } from "../platform/systemNotifications";
import { updateDevicePreferences, useDevicePreferences } from "../preferences/devicePreferences";
import { useAsyncAction } from "../shared/useAsyncAction";
import { SettingCheckboxRow } from "./SettingRow";

class NotificationsNotPermittedError extends Error {}

// 設定を入れたときに出す、確かめの通知の番号。期限の通知の番号（期限の名前から決める）とは別にしておく。
const CONFIRMATION_NOTIFICATION_ID = 1;

export function RemindersSection() {
  const { dueNotifications, stayResident } = useDevicePreferences();
  // 入れるときに、OS（かブラウザ）に通知の許可を求め、確かめの通知を 1 つ出す。許されないか、通知を出せなければ入れない
  // （スマホのブラウザは、許可しても、ページから通知を作らせない）。
  const turnOn = useAsyncAction(async () => {
    if (!(await requestNotificationPermission())) {
      throw new NotificationsNotPermittedError();
    }
    try {
      showNotification({ id: CONFIRMATION_NOTIFICATION_ID, title: translate("reminders.turnedOn"), body: translate("reminders.turnedOnBody") });
    } catch {
      throw new NotificationsNotPermittedError();
    }
    updateDevicePreferences({ dueNotifications: true });
  });
  const setDueNotifications = (enabled: boolean) => {
    if (enabled) {
      void turnOn.run(undefined);
    } else {
      turnOn.clearError();
      updateDevicePreferences({ dueNotifications: false });
    }
  };
  return (
    <section className="settings-section">
      <h2>{translate("settings.reminders")}</h2>
      <SettingCheckboxRow controlId="reminders-due-notifications" label={translate("reminders.notify")}
        hint={translate(isAndroidApp() ? "reminders.descriptionAndroid" : "reminders.description")}
        checked={dueNotifications} disabled={turnOn.busy} onChange={setDueNotifications} />
      {turnOn.errorMessage !== null && <div className="form-error" role="alert">{translate("reminders.notPermitted")}</div>}
      {canStayResident() && (
        <SettingCheckboxRow controlId="reminders-stay-resident" label={translate("reminders.stayResident")} hint={translate("reminders.stayResidentDescription")}
          checked={stayResident} onChange={(enabled) => updateDevicePreferences({ stayResident: enabled })} />
      )}
    </section>
  );
}
