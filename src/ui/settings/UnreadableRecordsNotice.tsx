// このデバイスに、開けない記録（復号できない記録）があるときの知らせ。設定のどのページにも出す。
// 件数だけで終わらせず、次に何をすればよいかと、どの記録か（ID。問い合わせるときに使う）を添える。
// 手元の記録が壊れていても、同期先の記録が壊れていなければ、このデバイスのデータを消して参加し直すと開けるようになる。

import { translate } from "../i18n/translate";
import type { SettingsPage } from "./settingsPages";

type UnreadableRecordsNoticeProps = {
  recordIds: string[];
  // 同期先があるか（同期先から入れ直せるか）。
  synced: boolean;
  onSelectPage: (page: SettingsPage) => void;
};

export function UnreadableRecordsNotice({ recordIds, synced, onSelectPage }: UnreadableRecordsNoticeProps) {
  return (
    <div className="form-error unreadable-records" role="alert">
      <p>{translate("settings.unreadable", { count: recordIds.length })}</p>
      <p>{translate(synced ? "settings.unreadableNextStepSynced" : "settings.unreadableNextStepLocal")}</p>
      <details>
        <summary>{translate("settings.unreadableIds")}</summary>
        <ul>{recordIds.map((recordId) => <li key={recordId}><code>{recordId}</code></li>)}</ul>
      </details>
      {synced && (
        <div className="form-actions">
          <button type="button" className="secondary-button" onClick={() => onSelectPage("data")}>{translate("settings.backupExport")}</button>
          <button type="button" className="secondary-button" onClick={() => onSelectPage("security")}>{translate("wipe.title")}</button>
        </div>
      )}
    </div>
  );
}
