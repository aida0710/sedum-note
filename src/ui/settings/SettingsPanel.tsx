// 設定の画面。設定はページに分けてあり（settingsPages.ts）、PC では左にページの一覧、右に開いているページを出す。
// スマホでは、まずページの一覧を出し、選んだページを 1 画面で出す（「戻る」で一覧へ）。

import { ChevronLeft } from "lucide-react";
import type { ReactNode } from "react";
import type { UnlockedVault } from "../../core/vault/vaultSession";
import { translate } from "../i18n/translate";
import { useBackGestureToClose } from "../mobile/useBackGestureToClose";
import type { VaultSession } from "../session/useVaultSession";
import { SettingsNavigation, SettingsPageList } from "./SettingsNavigation";
import { SettingsPageContent } from "./SettingsPageContent";
import { FIRST_SETTINGS_PAGE, type SettingsPage, settingsPagesFor } from "./settingsPages";

type SettingsPanelProps = {
  session: VaultSession;
  vault: UnlockedVault;
  unreadableCount: number;
  // スマホの組み方か。キーボードの無い画面には、ショートカットのページを出さない。
  isMobile: boolean;
  // 開いているページ。null はまだ選んでいない（PC では最初のページ、スマホではページの一覧を出す）。
  page: SettingsPage | null;
  onSelectPage: (page: SettingsPage | null) => void;
};

export function SettingsPanel({ session, vault, unreadableCount, isMobile, page, onSelectPage }: SettingsPanelProps) {
  const pages = settingsPagesFor({ isMobile });
  // 開けない記録の知らせは、どのページを開いていても出す。
  const unreadableWarning = unreadableCount > 0 && <div className="form-error">{translate("settings.unreadable", { count: unreadableCount })}</div>;
  if (isMobile) {
    return <PhoneSettings session={session} vault={vault} pages={pages} page={page} onSelectPage={onSelectPage} unreadableWarning={unreadableWarning} />;
  }
  const shownPage = page !== null && pages.includes(page) ? page : FIRST_SETTINGS_PAGE;
  return (
    <div className="settings-layout">
      <SettingsNavigation pages={pages} current={shownPage} onSelect={onSelectPage} />
      <div className="document-scroll">
        <div className="settings">
          {unreadableWarning}
          <SettingsPageContent page={shownPage} session={session} vault={vault} />
        </div>
      </div>
    </div>
  );
}

type PhoneSettingsProps = Pick<SettingsPanelProps, "session" | "vault" | "page" | "onSelectPage"> & {
  pages: SettingsPage[];
  unreadableWarning: ReactNode;
};

function PhoneSettings({ session, vault, pages, page, onSelectPage, unreadableWarning }: PhoneSettingsProps) {
  const shownPage = page !== null && pages.includes(page) ? page : null;
  // 端末の「戻る」で、アプリを閉じずにページの一覧へ戻す。
  const goBack = useBackGestureToClose(shownPage !== null, () => onSelectPage(null));
  if (shownPage === null) {
    return (
      <div className="document-scroll">
        <div className="settings">
          <h1>{translate("settings.title")}</h1>
          {unreadableWarning}
        </div>
        <SettingsPageList pages={pages} onSelect={onSelectPage} />
      </div>
    );
  }
  return (
    <>
      <div className="phone-top">
        <button type="button" className="phone-back" onClick={goBack}><ChevronLeft size={20} />{translate("settings.title")}</button>
      </div>
      <div className="document-scroll">
        <div className="settings">
          {unreadableWarning}
          <SettingsPageContent page={shownPage} session={session} vault={vault} />
        </div>
      </div>
    </>
  );
}
