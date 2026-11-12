// 設定: 期限の通知と、ウィンドウを閉じても動かしたままにするか（Windows と Mac のアプリだけ）。

import { translate } from "../i18n/translate";
import { canStayResident, isAndroidApp } from "../platform/runtime";
import { requestNotificationPermission } from "../platform/systemNotifications";
import { updateDevicePreferences, useDevicePreferences } from "../preferences/devicePreferences";
import { useAsyncAction } from "../shared/useAsyncAction";

class NotificationsNotPermittedError extends Error {}

export function RemindersSection() {
  const { dueNotifications, stayResident } = useDevicePreferences();
  // 入れるときに、OS（かブラウザ）に通知の許可を求める。許されなければ入れない。
  const turnOn = useAsyncAction(async () => {
    if (!(await requestNotificationPermission())) {
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
      <label className="checkbox-line">
        <input type="checkbox" checked={dueNotifications} disabled={turnOn.busy} onChange={(event) => setDueNotifications(event.target.checked)} />
        {translate("reminders.notify")}
      </label>
      {turnOn.errorMessage !== null && <div className="form-error" role="alert">{translate("reminders.notPermitted")}</div>}
      <p>{translate(isAndroidApp() ? "reminders.descriptionAndroid" : "reminders.description")}</p>
      {canStayResident() && (
        <>
          <label className="checkbox-line">
            <input type="checkbox" checked={stayResident} onChange={(event) => updateDevicePreferences({ stayResident: event.target.checked })} />
            {translate("reminders.stayResident")}
          </label>
          <p>{translate("reminders.stayResidentDescription")}</p>
        </>
      )}
    </section>
  );
}
