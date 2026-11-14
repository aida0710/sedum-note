// 設定の画面。設定はページに分けてあり（settingsPages.ts）、PC では左にページの一覧、右に開いているページを出す。
// スマホでは、まずページの一覧を出し、選んだページを 1 画面で出す（「戻る」で一覧へ）。

import { ChevronLeft } from "lucide-react";
import { type ReactNode, useRef } from "react";
import type { UnlockedVault } from "../../core/vault/vaultSession";
import { translate } from "../i18n/translate";
import type { VaultSession } from "../session/useVaultSession";
import { SettingsNavigation, SettingsPageList } from "./SettingsNavigation";
import { SettingsPageContent } from "./SettingsPageContent";
import { FIRST_SETTINGS_PAGE, SETTINGS_PAGE_META, type SettingsPage, settingsPagesFor } from "./settingsPages";
import { type SettingRevealRequest, useRevealSetting } from "./revealSetting";
import { UnreadableRecordsNotice } from "./UnreadableRecordsNotice";
import { useDialogs } from "../shared/DialogProvider";
import { runAfterConfirmingDraftDiscard } from "./unsavedSettingsDrafts";
import { ICON_SIZE } from "../shared/iconSizes";

type SettingsPanelProps = {
  session: VaultSession;
  vault: UnlockedVault;
  unreadableCount: number;
  // スマホの組み方か。キーボードの無い画面には、ショートカットのページを出さない。
  isMobile: boolean;
  // 開いているページ。null はまだ選んでいない（PC では最初のページ、スマホではページの一覧を出す）。
  page: SettingsPage | null;
  onSelectPage: (page: SettingsPage | null) => void;
  // スマホで、開いているページからページの一覧へ戻る（端末の「戻る」の履歴も外す）。PC では使わない。
  onBackToPageList?: () => void;
  // コマンドパレットで選んだ項目。開いたページの中で、そこまで送る（PC だけ）。
  revealRequest?: SettingRevealRequest | null;
};

export function SettingsPanel({ session, vault, unreadableCount, isMobile, page, onSelectPage: selectPage, onBackToPageList: backToPageList, revealRequest = null }: SettingsPanelProps) {
  const pages = settingsPagesFor({ isMobile });
  // ページを移ると、今のページの打ちかけ（保存していない入力）は消えるので、あれば捨ててよいかを聞いてから移る。
  const { confirm } = useDialogs();
  const onSelectPage = (next: SettingsPage | null) => runAfterConfirmingDraftDiscard(confirm, () => selectPage(next));
  const onBackToPageList = backToPageList && (() => runAfterConfirmingDraftDiscard(confirm, backToPageList));
  // 項目を探す範囲は、ページの中身だけ（左のページの一覧の「同期」などを当てないように）。
  const pageContent = useRef<HTMLDivElement>(null);
  useRevealSetting(revealRequest, pageContent);
  // 開けない記録の知らせは、どのページを開いていても出す。
  const unreadableWarning = unreadableCount > 0 && (
    <UnreadableRecordsNotice recordIds={vault.repository.unreadableIds()} synced={vault.syncEngine !== null} onSelectPage={onSelectPage} />
  );
  if (isMobile) {
    return <PhoneSettings session={session} vault={vault} pages={pages} page={page} onSelectPage={onSelectPage}
      onBackToPageList={onBackToPageList ?? (() => onSelectPage(null))} unreadableWarning={unreadableWarning} />;
  }
  const shownPage = page !== null && pages.includes(page) ? page : FIRST_SETTINGS_PAGE;
  return (
    <div className="settings-layout">
      <SettingsNavigation pages={pages} current={shownPage} onSelect={onSelectPage} />
      <div className="document-scroll">
        <div className="settings" ref={pageContent}>
          {unreadableWarning}
          <SettingsPageContent page={shownPage} session={session} vault={vault} onSelectPage={onSelectPage} isMobile={false} />
        </div>
      </div>
    </div>
  );
}

type PhoneSettingsProps = Pick<SettingsPanelProps, "session" | "vault" | "page" | "onSelectPage"> & {
  pages: SettingsPage[];
  onBackToPageList: () => void;
  unreadableWarning: ReactNode;
};

function PhoneSettings({ session, vault, pages, page, onSelectPage, onBackToPageList, unreadableWarning }: PhoneSettingsProps) {
  const shownPage = page !== null && pages.includes(page) ? page : null;
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
      {/* 戻るボタンの右に、開いているページの名前を出す（「< 設定　一般」）。ページの中の見出しと重ならないよう、見出しにはしない。 */}
      <div className="phone-top">
        <button type="button" className="phone-back" onClick={onBackToPageList}><ChevronLeft size={ICON_SIZE.large} />{translate("settings.title")}</button>
        <span className="phone-top-title">{translate(SETTINGS_PAGE_META[shownPage].label)}</span>
      </div>
      <div className="document-scroll">
        <div className="settings">
          {unreadableWarning}
          <SettingsPageContent page={shownPage} session={session} vault={vault} onSelectPage={onSelectPage} isMobile />
        </div>
      </div>
    </>
  );
}
