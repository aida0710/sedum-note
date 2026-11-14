// 設定の 1 ページに並べる欄。どの欄をどのページに置くかを、ここで決める。

import { useContext } from "react";
import type { UnlockedVault } from "../../core/vault/vaultSession";
import { AiSection } from "../ai/AiSection";
import { PluginsSection } from "../plugins/PluginsSection";
import type { VaultSession } from "../session/useVaultSession";
import { BackupSection } from "./BackupSection";
import { CustomCssSection } from "./CustomCssSection";
import { DisplaySection } from "./DisplaySection";
import { HapticFeedbackSection } from "./HapticFeedbackSection";
import { LockSection } from "./LockSection";
import { MarkdownSection } from "./MarkdownSection";
import { McpSectionSlot } from "./mcpSectionSlot";
import { isAndroidApp } from "../platform/runtime";
import { PassphraseSection } from "./PassphraseSection";
import type { SettingsPage } from "./settingsPages";
import { RemindersSection } from "./RemindersSection";
import { ShortcutsSection } from "./ShortcutsSection";
import { SpacesSection } from "./SpacesSection";
import { SyncSection } from "./SyncSection";
import { ThemeSection } from "./ThemeSection";
import { TrashSection } from "./TrashSection";
import { UpdateSection } from "./UpdateSection";
import { WipeDeviceDataSection } from "./WipeDeviceDataSection";
import { TemplateSection } from "./TemplateSection";

type SettingsPageContentProps = {
  page: SettingsPage;
  session: VaultSession;
  vault: UnlockedVault;
  // 設定のほかのページへ移る（「アプリの更新が必要」の知らせから「更新」のページへ、など）。
  onSelectPage: (page: SettingsPage) => void;
  // スマホの組み方か。スマホに無い機能の欄（本文の配置の既定）を出さない。
  isMobile: boolean;
};

export function SettingsPageContent({ page, session, vault, onSelectPage, isMobile }: SettingsPageContentProps) {
  const { repository } = vault;
  // PC 版では MCP の欄が入っている。Web 版と Android のアプリでは null。
  const mcpSection = useContext(McpSectionSlot);
  switch (page) {
    case "general":
      return (
        <>
          <DisplaySection showsPageAlignment={!isMobile} />
          {/* 振動は Android のアプリだけ（Web 版と PC のアプリでは何もしないので、欄も出さない）。 */}
          {isAndroidApp() && <HapticFeedbackSection />}
          <TemplateSection /><RemindersSection /><TrashSection repository={repository} /><SpacesSection />
        </>
      );
    case "appearance":
      return <><ThemeSection /><CustomCssSection /></>;
    case "sync":
      return <SyncSection session={session} vault={vault} onOpenUpdatePage={() => onSelectPage("update")} />;
    case "data":
      return <><BackupSection session={session} /><MarkdownSection repository={repository} /></>;
    case "security":
      return <><PassphraseSection session={session} /><LockSection session={session} /><WipeDeviceDataSection session={session} /></>;
    case "shortcuts":
      return <ShortcutsSection />;
    case "ai":
      return <>{mcpSection}<AiSection /></>;
    case "plugins":
      return <PluginsSection />;
    case "update":
      return <UpdateSection repository={repository} />;
  }
}
