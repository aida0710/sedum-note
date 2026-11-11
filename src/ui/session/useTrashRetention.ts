// 設定した日数を過ぎたゴミ箱のメモを、同期が成功した直後に完全に削除する。同期を設定していなければ、
// ロックを解除したときに削除する。既定は「削除しない」。

import { useEffect } from "react";
import { removeExpiredTrash } from "../../core/notes/trashRetention";
import type { SyncStatus } from "../../core/sync/autoSync";
import type { UnlockedVault } from "../../core/vault/vaultSession";
import { useDevicePreferences } from "../preferences/devicePreferences";

export function useTrashRetention(vault: UnlockedVault, syncStatus: SyncStatus | null): void {
  const { trashRetentionDays } = useDevicePreferences();
  // 同期ありなら、同期が成功するたびに変わる値。同期なしなら、ずっと同じ値（ロック解除のときの 1 回だけ動く）。
  const syncedAt = vault.syncEngine === null ? "no-sync" : syncStatus?.state === "idle" ? syncStatus.lastSyncedAt?.getTime() ?? null : null;
  useEffect(() => {
    if (trashRetentionDays === null || syncedAt === null) {
      return;
    }
    void removeExpiredTrash(vault.repository, trashRetentionDays, new Date());
  }, [vault, trashRetentionDays, syncedAt]);
}
