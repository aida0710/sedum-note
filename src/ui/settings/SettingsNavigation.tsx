// 設定のページの一覧。PC では開いているページの左に並べ（SettingsNavigation）、スマホでは設定を開いた最初の画面に並べる（SettingsPageList）。

import { ChevronRight } from "lucide-react";
import { translate } from "../i18n/translate";
import { SETTINGS_PAGE_META, type SettingsPage } from "./settingsPages";
import { ICON_SIZE } from "../shared/iconSizes";

type SettingsNavigationProps = {
  pages: SettingsPage[];
  current: SettingsPage;
  onSelect: (page: SettingsPage) => void;
};

export function SettingsNavigation({ pages, current, onSelect }: SettingsNavigationProps) {
  return (
    <nav className="settings-navigation" aria-label={translate("settings.pages")}>
      <h1>{translate("settings.title")}</h1>
      {pages.map((page) => {
        const { label, icon: Icon } = SETTINGS_PAGE_META[page];
        return (
          <button key={page} type="button" className={`nav${page === current ? " active" : ""}`} aria-current={page === current ? "page" : undefined}
            onClick={() => onSelect(page)}>
            <Icon size={ICON_SIZE.row} />
            <span className="nav-label">{translate(label)}</span>
          </button>
        );
      })}
    </nav>
  );
}

export function SettingsPageList({ pages, onSelect }: Omit<SettingsNavigationProps, "current">) {
  return (
    <nav className="settings-page-list" aria-label={translate("settings.pages")}>
      {pages.map((page) => {
        const { label, icon: Icon } = SETTINGS_PAGE_META[page];
        return (
          <button key={page} type="button" className="library-row" onClick={() => onSelect(page)}>
            <Icon size={ICON_SIZE.touch} />
            <span>{translate(label)}</span>
            <ChevronRight size={ICON_SIZE.touch} className="settings-page-list-chevron" />
          </button>
        );
      })}
    </nav>
  );
}
