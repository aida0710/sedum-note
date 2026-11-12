// スマホの一覧を上から引いて離したときの同期。同期先が無ければ null（一覧を引けない）。
// スマホの一覧には同期の状態の表示が無いので、引いて始めた同期が失敗したら知らせを出す。
// 「今すぐ同期」は失敗しても例外を投げず、状態（session.syncStatus）を failed にするので、状態の変化で見る。

import { useEffect, useRef } from "react";
import { translate } from "../i18n/translate";
import type { VaultSession } from "../session/useVaultSession";
import { useToast } from "../shared/ToastProvider";

export function useSyncFromPull(session: VaultSession): (() => Promise<void>) | null {
  const showToast = useToast();
  // 引いて始めた同期の結果を待っているか。
  const waitsForPullResult = useRef(false);
  const { syncStatus } = session;

  useEffect(() => {
    if (!waitsForPullResult.current || syncStatus === null || syncStatus.state === "syncing") {
      return;
    }
    waitsForPullResult.current = false;
    if (syncStatus.state === "failed") {
      showToast({ message: translate("mobile.pullSyncFailed") });
    }
  }, [syncStatus, showToast]);

  if (syncStatus === null) {
    return null;
  }
  return async () => {
    waitsForPullResult.current = true;
    await session.syncNow();
  };
}
