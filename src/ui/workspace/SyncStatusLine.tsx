// 左の列の下の同期の状態。押すと設定を開く。

import { useContext, useEffect, useState } from "react";
import type { SyncStatus } from "../../core/sync/autoSync";
import { translate } from "../i18n/translate";
import { useDevicePreferences } from "../preferences/devicePreferences";
import { UnsyncedRecordsContext } from "../session/useRepositorySnapshot";

// 「n分前」を更新する間隔。
const RELATIVE_TIME_REFRESH_MILLISECONDS = 30_000;
const MILLISECONDS_PER_MINUTE = 60_000;

type SyncStatusInput = { status: SyncStatus | null; now: Date; unsyncedCount: number; automatic: boolean };

export function describeSyncStatus({ status, now, unsyncedCount, automatic }: SyncStatusInput): { text: string; dotClass: string } {
  if (status === null) {
    return { text: translate("sync.notConfigured"), dotClass: "off" };
  }
  if (status.state === "syncing") {
    return { text: translate("sync.syncing"), dotClass: "syncing" };
  }
  if (status.state === "failed") {
    // 直らない失敗で自動の同期を止めているときは、そう言う（待っても同期されない）。
    return { text: translate(status.willRetry ? "sync.failed" : "sync.stopped"), dotClass: "failed" };
  }
  if (unsyncedCount > 0) {
    return { text: translate("sync.unsynced", { count: unsyncedCount }), dotClass: "syncing" };
  }
  if (!automatic) {
    return { text: translate("sync.automaticOff"), dotClass: "off" };
  }
  if (status.lastSyncedAt === null) {
    return { text: translate("sync.never"), dotClass: "off" };
  }
  const minutes = Math.floor((now.getTime() - status.lastSyncedAt.getTime()) / MILLISECONDS_PER_MINUTE);
  const time = minutes < 1 ? translate("sync.justNow") : translate("sync.minutesAgo", { count: minutes });
  return { text: translate("sync.synced", { time }), dotClass: "" };
}

export function SyncStatusLine({ status, onOpenSettings }: { status: SyncStatus | null; onOpenSettings: () => void }) {
  const unsyncedCount = useContext(UnsyncedRecordsContext).size;
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), RELATIVE_TIME_REFRESH_MILLISECONDS);
    return () => clearInterval(timer);
  }, []);
  const { autoSync: automatic } = useDevicePreferences();
  const { text, dotClass } = describeSyncStatus({ status, now, unsyncedCount, automatic });
  return (
    <button className="sync-line" onClick={onOpenSettings}>
      <span className={`status-dot ${dotClass}`} />{text}
    </button>
  );
}
