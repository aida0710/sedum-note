// vault の状態（未作成・ロック中・解除中）と、解除中の自動同期をまとめて持つ hook。

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type BackupExport, exportBackup, restoreBackup } from "../../core/backup/vaultBackup";
import type { RemoteConfig } from "../../core/remote/remoteConfig";
import { AutoSync, type SyncStatus } from "../../core/sync/autoSync";
import { checkSyncTarget, type SyncTargetCheck } from "../../core/vault/syncTarget";
import {
  changePassphrase,
  connectRemote,
  createNewVault,
  type DeviceDataSummary,
  joinExistingVault,
  readVaultState,
  replaceSyncKey,
  summarizeDeviceData,
  type SyncTargetChoice,
  type UnlockedVault,
  unlockLocalVault,
  type VaultEntry,
  wipeDeviceData,
} from "../../core/vault/vaultSession";
import { resetDevicePreferences, useDevicePreferences } from "../preferences/devicePreferences";
import { createAppEnvironment } from "./appEnvironment";

export type VaultPhase =
  | { phase: "loading" }
  | { phase: "absent" }
  | { phase: "locked" }
  | { phase: "unlocked"; vault: UnlockedVault };

export type VaultSession = {
  state: VaultPhase;
  syncStatus: SyncStatus | null;
  // 同期先を選んだときは、その状態（checkSyncTarget の結果）に合わせて、新しく作るか既存のメモに参加する。
  startVault: (input: { passphrase: string; syncTarget: SyncTargetChoice | null }) => Promise<void>;
  unlock: (passphrase: string) => Promise<void>;
  lock: () => void;
  // 同期先の今の状態を確かめる（画面の「接続を確認」）。何も保存しない。
  checkSyncTarget: (remoteConfig: RemoteConfig) => Promise<SyncTargetCheck>;
  // 確かめた同期先を保存して、同期を始める。空の同期先に置くときは、このデバイスのパスフレーズが要る。
  connectSyncTarget: (input: { syncTarget: SyncTargetChoice; passphrase: string | null }) => Promise<void>;
  replaceSyncKey: (input: { passphrase: string; syncKey: string | null }) => Promise<void>;
  // 生成したばかりの暗号化キー。1 度だけ見せるためにメモリに持ち、閉じたら捨てる。
  generatedSyncKey: string | null;
  dismissGeneratedSyncKey: () => void;
  changePassphrase: (passphrases: { current: string; next: string }) => Promise<void>;
  syncNow: () => Promise<void>;
  exportBackup: () => Promise<BackupExport>;
  // 空のデバイスにバックアップを戻し、そのままロックを解除する。
  restoreBackup: (input: { file: Uint8Array; passphrase: string }) => Promise<void>;
  summarizeDeviceData: () => Promise<DeviceDataSummary>;
  // このデバイスのデータと表示の設定を消し、最初の画面から始め直す。ロック中でも使える。
  wipeDeviceData: () => Promise<void>;
};

export function useVaultSession(): VaultSession {
  const environment = useMemo(createAppEnvironment, []);
  const [state, setState] = useState<VaultPhase>({ phase: "loading" });
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [generatedSyncKey, setGeneratedSyncKey] = useState<string | null>(null);
  const { autoSync: syncsAutomatically } = useDevicePreferences();
  // 自動の同期の入り切りで AutoSync を作り直さない（作り直すと、最後に同期した時刻を忘れる）。
  const syncsAutomaticallyRef = useRef(syncsAutomatically);
  syncsAutomaticallyRef.current = syncsAutomatically;
  const autoSyncRef = useRef<AutoSync | null>(null);

  useEffect(() => {
    void readVaultState(environment.localStore).then((vaultState) =>
      setState({ phase: vaultState === "absent" ? "absent" : "locked" }),
    );
  }, [environment]);

  const vault = state.phase === "unlocked" ? state.vault : null;

  // アプリを裏へ回す・閉じるときは、保存を待っている入力をすぐ手元に書く。
  useEffect(() => {
    if (!vault) {
      return;
    }
    const saveNow = () => void vault.repository.flush();
    const saveWhenHidden = () => document.visibilityState === "hidden" && saveNow();
    document.addEventListener("visibilitychange", saveWhenHidden);
    window.addEventListener("pagehide", saveNow);
    return () => {
      document.removeEventListener("visibilitychange", saveWhenHidden);
      window.removeEventListener("pagehide", saveNow);
    };
  }, [vault]);

  // 解除中は、このデバイスでの変更のたびに送る予約をする。取り込んだ変更は、同期の中で
  // 開いている文書に入るので、ここで読み直すものは無い。
  useEffect(() => {
    if (!vault?.syncEngine) {
      setSyncStatus(null);
      return;
    }
    const autoSync = new AutoSync(vault.syncEngine, { onStatus: setSyncStatus, automatic: syncsAutomaticallyRef.current });
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

  useEffect(() => {
    autoSyncRef.current?.setAutomatic(syncsAutomatically);
  }, [syncsAutomatically]);

  const enter = useCallback((unlocked: UnlockedVault) => setState({ phase: "unlocked", vault: unlocked }), []);
  const enterWithSyncKey = useCallback((entry: VaultEntry) => {
    setGeneratedSyncKey(entry.generatedSyncKey);
    enter(entry.unlocked);
  }, [enter]);

  return {
    state,
    syncStatus,
    generatedSyncKey,
    dismissGeneratedSyncKey: () => setGeneratedSyncKey(null),
    startVault: async ({ passphrase, syncTarget }) => {
      const joins = syncTarget?.inspected.state === "existing";
      enterWithSyncKey(joins
        ? await joinExistingVault(environment, { passphrase, syncTarget })
        : await createNewVault(environment, { passphrase, syncTarget }));
    },
    unlock: async (passphrase) => enter(await unlockLocalVault(environment, passphrase)),
    lock: () => {
      setGeneratedSyncKey(null);
      setState({ phase: "locked" });
    },
    checkSyncTarget: (remoteConfig) => checkSyncTarget(environment.createObjectStore, remoteConfig),
    connectSyncTarget: async (input) => {
      if (vault) {
        enterWithSyncKey(await connectRemote(environment, vault, input));
      }
    },
    replaceSyncKey: async (input) => {
      if (vault) {
        setGeneratedSyncKey(await replaceSyncKey(environment, vault, input));
      }
    },
    changePassphrase: (passphrases) => changePassphrase(environment, passphrases),
    exportBackup: () => {
      if (!vault) {
        throw new Error("the vault is locked");
      }
      return exportBackup(environment.localStore, vault.repository, new Date());
    },
    restoreBackup: async ({ file, passphrase }) => {
      await restoreBackup(environment.localStore, file, passphrase);
      enter(await unlockLocalVault(environment, passphrase));
    },
    summarizeDeviceData: () => summarizeDeviceData(environment.localStore),
    wipeDeviceData: async () => {
      autoSyncRef.current?.stop();
      await wipeDeviceData(environment.localStore, vault);
      resetDevicePreferences();
      // メモリに残った鍵と開いた文書ごと捨てて、最初の画面から始め直す。
      window.location.reload();
    },
    syncNow: async () => {
      await autoSyncRef.current?.syncNow();
    },
  };
}
