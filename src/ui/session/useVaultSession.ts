// vault の状態（未作成・ロック中・解除中）と、解除中の自動同期をまとめて持つ hook。

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RemoteConfig } from "../../core/remote/remoteConfig";
import { AutoSync, type SyncStatus } from "../../core/sync/autoSync";
import {
  changePassphrase,
  connectRemote,
  createNewVault,
  joinExistingVault,
  readVaultState,
  type UnlockedVault,
  unlockLocalVault,
} from "../../core/vault/vaultSession";
import { createAppEnvironment } from "./appEnvironment";

export type VaultPhase =
  | { phase: "loading" }
  | { phase: "absent" }
  | { phase: "locked" }
  | { phase: "unlocked"; vault: UnlockedVault };

export type VaultSession = {
  state: VaultPhase;
  syncStatus: SyncStatus | null;
  createVault: (input: { passphrase: string; remoteConfig: RemoteConfig | null }) => Promise<void>;
  joinVault: (input: { passphrase: string; remoteConfig: RemoteConfig }) => Promise<void>;
  unlock: (passphrase: string) => Promise<void>;
  lock: () => void;
  saveRemoteConfig: (remoteConfig: RemoteConfig) => Promise<void>;
  changePassphrase: (passphrases: { current: string; next: string }) => Promise<void>;
  syncNow: () => Promise<void>;
};

export function useVaultSession(): VaultSession {
  const environment = useMemo(createAppEnvironment, []);
  const [state, setState] = useState<VaultPhase>({ phase: "loading" });
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const autoSyncRef = useRef<AutoSync | null>(null);

  useEffect(() => {
    void readVaultState(environment.localStore).then((vaultState) =>
      setState({ phase: vaultState === "absent" ? "absent" : "locked" }),
    );
  }, [environment]);

  const vault = state.phase === "unlocked" ? state.vault : null;

  // 解除中は、この端末での変更のたびに送る予約をし、同期で取り込んだものを開き直す。
  useEffect(() => {
    if (!vault?.syncEngine) {
      setSyncStatus(null);
      return;
    }
    const autoSync = new AutoSync(vault.syncEngine, {
      onReport: (report) => vault.repository.reloadRecords(report.pulledIds),
      onStatus: setSyncStatus,
    });
    const unsubscribe = vault.repository.subscribe((origin) => {
      if (origin === "local") {
        autoSync.noteLocalChange();
      }
    });
    autoSyncRef.current = autoSync;
    autoSync.start();
    return () => {
      unsubscribe();
      autoSync.stop();
      autoSyncRef.current = null;
    };
  }, [vault]);

  const enter = useCallback((unlocked: UnlockedVault) => setState({ phase: "unlocked", vault: unlocked }), []);

  return {
    state,
    syncStatus,
    createVault: async (input) => enter(await createNewVault(environment, input)),
    joinVault: async (input) => enter(await joinExistingVault(environment, input)),
    unlock: async (passphrase) => enter(await unlockLocalVault(environment, passphrase)),
    lock: () => setState({ phase: "locked" }),
    saveRemoteConfig: async (remoteConfig) => {
      if (vault) {
        enter(await connectRemote(environment, vault, remoteConfig));
      }
    },
    changePassphrase: async (passphrases) => {
      if (vault) {
        await changePassphrase(environment, vault, passphrases);
      }
    },
    syncNow: async () => {
      await autoSyncRef.current?.syncNow();
    },
  };
}
