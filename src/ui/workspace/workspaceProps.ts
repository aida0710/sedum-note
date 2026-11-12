import type { UnlockedVault } from "../../core/vault/vaultSession";
import type { RepositorySnapshot } from "../session/useRepositorySnapshot";
import type { VaultSession } from "../session/useVaultSession";
import type { WorkspaceNavigation } from "./useWorkspaceNavigation";

export type WorkspaceProps = {
  session: VaultSession;
  vault: UnlockedVault;
  snapshot: RepositorySnapshot;
  navigation: WorkspaceNavigation;
  // メモを 1 つだけ開く、別のウィンドウか。左の列とタブを出さない。
  isNoteWindow: boolean;
};
