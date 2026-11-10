// 画面の入口。vault の状態で、初回の設定・ロック解除・メモの画面を出し分ける。

import { SetupScreen } from "./entry/SetupScreen";
import { UnlockScreen } from "./entry/UnlockScreen";
import { DialogProvider } from "./shared/DialogProvider";
import { AttachmentReaderContext } from "./editor/attachmentReader";
import { MobileWorkspace } from "./mobile/MobileWorkspace";
import { useRepositorySnapshot } from "./session/useRepositorySnapshot";
import { useVaultSession, type VaultSession } from "./session/useVaultSession";
import { MOBILE_LAYOUT_QUERY, useMediaQuery } from "./shared/useMediaQuery";
import { DesktopWorkspace } from "./workspace/DesktopWorkspace";
import { useWorkspaceNavigation } from "./workspace/useWorkspaceNavigation";
import type { UnlockedVault } from "../core/vault/vaultSession";

export function App() {
  const session = useVaultSession();
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

function UnlockedApp({ session, vault }: { session: VaultSession; vault: UnlockedVault }) {
  const snapshot = useRepositorySnapshot(vault.repository);
  const navigation = useWorkspaceNavigation();
  const isMobile = useMediaQuery(MOBILE_LAYOUT_QUERY);
  const props = { session, vault, snapshot, navigation };
  return (
    <AttachmentReaderContext.Provider value={vault.repository.readAttachment.bind(vault.repository)}>
      <DialogProvider>
        {isMobile ? <MobileWorkspace {...props} /> : <DesktopWorkspace {...props} />}
      </DialogProvider>
    </AttachmentReaderContext.Provider>
  );
}
