// スマホの一覧を上から引いて離したときの同期。同期先が無ければ null（一覧を引けない）。
// 引いて始めた同期が失敗したら知らせを出し、知らせのボタンから設定の「同期」のページ（失敗の理由が出る）へ移れるようにする。
// 「今すぐ同期」は失敗しても例外を投げず、状態（session.syncStatus）を failed にするので、状態の変化で見る。

import { useEffect, useRef } from "react";
import { translate } from "../i18n/translate";
import type { VaultSession } from "../session/useVaultSession";
import { useToast } from "../shared/ToastProvider";

type SyncFromPullInput = { session: VaultSession; onOpenSyncSettings: () => void };

export function useSyncFromPull({ session, onOpenSyncSettings }: SyncFromPullInput): (() => Promise<void>) | null {
  const showToast = useToast();
  // 引いて始めた同期の結果を待っているか。
  const waitsForPullResult = useRef(false);
  const { syncStatus } = session;
  const openSyncSettingsRef = useRef(onOpenSyncSettings);
  openSyncSettingsRef.current = onOpenSyncSettings;

  useEffect(() => {
    if (!waitsForPullResult.current || syncStatus === null || syncStatus.state === "syncing") {
      return;
    }
    waitsForPullResult.current = false;
    if (syncStatus.state === "failed") {
      showToast({ message: translate("sync.failed"), action: { label: translate("mobile.openSyncSettings"), run: () => openSyncSettingsRef.current() } });
    }
  }, [syncStatus, showToast]);

  // 同期を設定していないか、ほかのウィンドウが同期を受け持っているときは、引いても同期を始められない。
  if (syncStatus === null || syncStatus.state === "delegated") {
    return null;
  }
  return async () => {
    waitsForPullResult.current = true;
    await session.syncNow();
  };
}
