// vault の状態（未作成・ロック中・解除中）と、解除中の自動同期をまとめて持つ hook。

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type BackupExport, exportBackup, restoreBackup } from "../../core/backup/vaultBackup";
import { DATA_FORMAT_VERSION } from "../../core/format/dataFormat";
import type { RemoteConfig } from "../../core/remote/remoteConfig";
import { AutoSync, type SyncStatus } from "../../core/sync/autoSync";
import { exportSyncSetup } from "../../core/vault/syncSetupFile";
import { checkSyncTarget, type SyncTargetCheck } from "../../core/vault/syncTarget";
import {
  connectRemote,
  createNewVault,
  type DeviceDataSummary,
  joinExistingVault,
  readVaultState,
  reopenLocalVault,
  replaceSyncKey,
  type SyncTargetChoice,
  type UnlockedVault,
  unlockLocalVault,
  type VaultEntry,
  verifyPassphrase,
  wipeDeviceData,
} from "../../core/vault/vaultSession";
import { resetDevicePreferences, useDevicePreferences } from "../preferences/devicePreferences";
import { holdSyncDuty, onWindowSignal, sendWindowSignal } from "../platform/crossWindowStorage";
import { createAppEnvironment } from "./appEnvironment";
import { clearDueReminderRecords } from "./dueReminderRecords";
import { changePassphraseOfAllSpaces, destroyOtherSpaces, summarizeAllSpaces, forgetUnlockedSpaces, masterKeyOfUnlockedSpace, rememberUnlockedSpace, verifyPassphraseOfOtherSpaces } from "./spaceVaults";

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
  // 保存を待っている入力を手元に書いてから、パスフレーズを入れるまで開けない状態にする。
  lock: () => Promise<void>;
  // 入れた文字が、このデバイスのパスフレーズかを確かめる。違えば失敗する。
  verifyPassphrase: (passphrase: string) => Promise<void>;
  // 同期先の今の状態を確かめる（画面の「接続を確認」）。何も保存しない。
  checkSyncTarget: (remoteConfig: RemoteConfig) => Promise<SyncTargetCheck>;
  // 確かめた同期先を保存して、同期を始める。空の同期先に置くときは、このデバイスのパスフレーズが要る。
  connectSyncTarget: (input: { syncTarget: SyncTargetChoice; passphrase: string | null }) => Promise<void>;
  replaceSyncKey: (input: { passphrase: string; syncKey: string | null }) => Promise<void>;
  // 同期の設定を、ほかのデバイスへ渡すための文書にする（暗号化キーが無いと読めない）。
  exportSyncSetup: () => Promise<string>;
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

// spaceId は、開くスペース（spaceRegistry.ts）。スペースを切り替えるときは、呼び出し側が、この hook ごと作り直す。
export function useVaultSession(spaceId: string): VaultSession {
  const environment = useMemo(() => createAppEnvironment(spaceId), [spaceId]);
  const [state, setState] = useState<VaultPhase>({ phase: "loading" });
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [generatedSyncKey, setGeneratedSyncKey] = useState<string | null>(null);
  const { autoSync: syncsAutomatically } = useDevicePreferences();
  // 自動の同期の入り切りで AutoSync を作り直さない（作り直すと、最後に同期した時刻を忘れる）。
  const syncsAutomaticallyRef = useRef(syncsAutomatically);
  syncsAutomaticallyRef.current = syncsAutomatically;
  const autoSyncRef = useRef<AutoSync | null>(null);

  useEffect(() => {
    // 読んでいる間にこのスペースの画面を離れたら、開いた vault は使わずに手放す。
    let left = false;
    void (async () => {
      if (await readVaultState(environment.localStore) === "absent") {
        setState({ phase: "absent" });
        return;
      }
      // このスペースを、ロックする前にもう解除してあれば、パスフレーズを聞かずに開き直す。
      const masterKey = masterKeyOfUnlockedSpace(spaceId);
      if (masterKey === null) {
        setState({ phase: "locked" });
        return;
      }
      const reopened = await reopenLocalVault(environment, masterKey);
      if (left) {
        reopened.repository.release();
      } else {
        setState({ phase: "unlocked", vault: reopened });
      }
    })();
    return () => {
      left = true;
    };
  }, [environment, spaceId]);

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
    // 同じ vault を 2 つのウィンドウで開いているときは、片方だけが同期する（同じ記録を 2 つの画面から送り合わない）。
    // 受け持ちでないウィンドウの編集は、手元の保存を通じて、受け持ちのウィンドウが送る。
    setSyncStatus({ state: "delegated" });
    const releaseSyncDuty = holdSyncDuty(vault.vaultId, () => {
      autoSyncRef.current = autoSync;
      autoSync.start();
    });
    return () => {
      unsubscribe();
      autoSync.stop();
      autoSyncRef.current = null;
      releaseSyncDuty();
    };
  }, [vault]);

  useEffect(() => {
    autoSyncRef.current?.setAutomatic(syncsAutomatically);
  }, [syncsAutomatically]);

  // この vault を手放すとき（ロック、スペースの切り替え、同期先のつなぎ直し）に、保存を待っている入力を手元に書いてから、
  // ほかのウィンドウの書き込みを受け取るのをやめる。
  useEffect(() => () => {
    if (vault) {
      void vault.repository.flush().finally(() => vault.repository.release());
    }
  }, [vault]);

  // ほかのウィンドウでロックしたら、このウィンドウもロックする。ほかのウィンドウがデータを消したら、最初の画面から始め直す
  // （ロックしたままのウィンドウも）。
  // 新しい版のアプリ（Web 版を開き直したタブなど）が手元のデータを新しい形にしたら、このウィンドウの入力を書いてから
  // 読み込み直し、新しい版のアプリで開き直す。古い版のままだと、古い形で書き続けてしまう。
  useEffect(() => onWindowSignal((signal) => {
    if (signal === "wiped") {
      window.location.reload();
      return;
    }
    if (typeof signal === "object") {
      if (signal.version > DATA_FORMAT_VERSION) {
        void (vault?.repository.flush() ?? Promise.resolve()).finally(() => window.location.reload());
      }
      return;
    }
    forgetUnlockedSpaces();
    if (vault) {
      // このウィンドウでまだ保存していない入力を書いてから、ロックする。
      void vault.repository.flush().then(() => {
        setGeneratedSyncKey(null);
        setState({ phase: "locked" });
      });
    }
  }), [vault]);

  const enter = useCallback((unlocked: UnlockedVault) => {
    rememberUnlockedSpace(spaceId, unlocked.masterKey);
    setState({ phase: "unlocked", vault: unlocked });
  }, [spaceId]);
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
      // パスフレーズは、このデバイスで共通。ほかのスペースがあれば、そのパスフレーズと同じであることを確かめる。
      await verifyPassphraseOfOtherSpaces(spaceId, passphrase);
      const joins = syncTarget?.inspected.state === "existing";
      enterWithSyncKey(joins
        ? await joinExistingVault(environment, { passphrase, syncTarget })
        : await createNewVault(environment, { passphrase, syncTarget }));
    },
    unlock: async (passphrase) => enter(await unlockLocalVault(environment, passphrase)),
    lock: async () => {
      // ロックのあとに解除すると、メモを手元の保存から読み直す。まだ書いていない入力は、ここで書かないと失う。
      await vault?.repository.flush();
      // 同じメモを開いている、ほかのウィンドウ（別のウィンドウ、ほかのタブ）もロックする。
      sendWindowSignal("lock");
      forgetUnlockedSpaces();
      setGeneratedSyncKey(null);
      setState({ phase: "locked" });
    },
    verifyPassphrase: (passphrase) => verifyPassphrase(environment, passphrase),
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
    exportSyncSetup: () => {
      if (!vault) {
        throw new Error("the vault is locked");
      }
      return exportSyncSetup(environment, vault);
    },
    changePassphrase: changePassphraseOfAllSpaces,
    exportBackup: () => {
      if (!vault) {
        throw new Error("the vault is locked");
      }
      return exportBackup(environment.localStore, vault.repository, new Date());
    },
    restoreBackup: async ({ file, passphrase }) => {
      // バックアップを戻すと、このスペースのパスフレーズは、バックアップのパスフレーズになる。ほかのスペースと同じものだけを受け付ける。
      await verifyPassphraseOfOtherSpaces(spaceId, passphrase);
      await restoreBackup(environment.localStore, file, passphrase);
      enter(await unlockLocalVault(environment, passphrase));
    },
    // 消すのは全部のスペースなので、失われるものも全部のスペースで数える。
    summarizeDeviceData: summarizeAllSpaces,
    wipeDeviceData: async () => {
      autoSyncRef.current?.stop();
      await wipeDeviceData(environment.localStore, vault);
      await destroyOtherSpaces(spaceId);
      sendWindowSignal("wiped");
      resetDevicePreferences();
      await clearDueReminderRecords();
      // メモリに残った鍵と開いた文書ごと捨てて、最初の画面から始め直す。
      window.location.reload();
    },
    syncNow: async () => {
      await autoSyncRef.current?.syncNow();
    },
  };
}
