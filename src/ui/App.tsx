// 画面の入口。vault の状態で、初回の設定・ロック解除・メモの画面を出し分ける。

import { useEffect } from "react";
import { languageInUse } from "./i18n/languageInUse";
import { useDevicePreferences } from "./preferences/devicePreferences";
import { useSharedContentInbox } from "./share/useSharedContentInbox";
import { applyAppearance } from "./theme/applyAppearance";
import { useThemeInUse } from "./theme/themeInUse";
import { SetupScreen } from "./entry/SetupScreen";
import { UnlockScreen } from "./entry/UnlockScreen";
import { DialogProvider } from "./shared/DialogProvider";
import { AttachmentReaderContext } from "./editor/attachmentReader";
import { MobileWorkspace } from "./mobile/MobileWorkspace";
import { UnsyncedRecordsContext, useRepositorySnapshot } from "./session/useRepositorySnapshot";
import { useVaultSession, type VaultSession } from "./session/useVaultSession";
import { MOBILE_LAYOUT_QUERY, useMediaQuery } from "./shared/useMediaQuery";
import { DesktopWorkspace } from "./workspace/DesktopWorkspace";
import { useWorkspaceNavigation } from "./workspace/useWorkspaceNavigation";
import type { UnlockedVault } from "../core/vault/vaultSession";

export function App() {
  const session = useVaultSession();
  // 言語を変えたら、ここから下を描き直して文言を入れ替える。
  const { language, editorFontSize } = useDevicePreferences();
  useEffect(() => {
    document.documentElement.lang = languageInUse();
  }, [language]);
  const theme = useThemeInUse();
  useEffect(() => applyAppearance({ theme, editorFontSize }), [theme, editorFontSize]);
  return <DialogProvider><ScreenForPhase session={session} /></DialogProvider>;
}

function ScreenForPhase({ session }: { session: VaultSession }) {
  switch (session.state.phase) {
    case "loading":
      return null;
    case "absent":
      return <SetupScreen session={session} />;
    case "locked":
      return <UnlockScreen session={session} />;
    case "unlocked":
      return <UnlockedApp key={session.state.vault.syncEngine ? "synced" : "local"} session={session} vault={session.state.vault} />;
  }
}

// 同期を設定していなければ、未送信の印は出さない（送る先が無い）。
const NO_UNSYNCED_RECORDS: ReadonlySet<string> = new Set();

function UnlockedApp({ session, vault }: { session: VaultSession; vault: UnlockedVault }) {
  const snapshot = useRepositorySnapshot(vault.repository);
  const navigation = useWorkspaceNavigation();
  const isMobile = useMediaQuery(MOBILE_LAYOUT_QUERY);
  useSharedContentInbox(vault.repository, navigation.openNote);
  const props = { session, vault, snapshot, navigation };
  return (
    <AttachmentReaderContext.Provider value={vault.repository.readAttachment.bind(vault.repository)}>
      <UnsyncedRecordsContext.Provider value={vault.syncEngine ? snapshot.unsyncedIds : NO_UNSYNCED_RECORDS}>
        {isMobile ? <MobileWorkspace {...props} /> : <DesktopWorkspace {...props} />}
      </UnsyncedRecordsContext.Provider>
    </AttachmentReaderContext.Provider>
  );
}
