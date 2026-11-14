// 左の列の下の同期の状態。押すと設定の同期のページを開く。
// 失敗は、色だけでなく形の違う印（警告の三角）で示し、理由を title で読めるようにする。

import { TriangleAlert } from "lucide-react";
import { useContext, useEffect, useState } from "react";
import type { SyncStatus } from "../../core/sync/autoSync";
import type { SyncProgress } from "../../core/sync/syncEngine";
import { describeErrorReason } from "../i18n/describeError";
import { translate } from "../i18n/translate";
import { useDevicePreferences } from "../preferences/devicePreferences";
import { formatCount } from "../shared/formatCount";
import { UnsyncedRecordsContext } from "../session/useRepositorySnapshot";
import { ICON_SIZE } from "../shared/iconSizes";

// 「n分前」を更新する間隔。
const RELATIVE_TIME_REFRESH_MILLISECONDS = 30_000;
const MILLISECONDS_PER_MINUTE = 60_000;

type SyncStatusInput = { status: SyncStatus | null; now: Date; unsyncedCount: number; automatic: boolean };

// failureReason は、失敗したときの理由の文。失敗していなければ null。
type SyncStatusDescription = { text: string; dotClass: string; failureReason: string | null };

export function describeSyncStatus(input: SyncStatusInput): SyncStatusDescription {
  const { status } = input;
  const failureReason = status?.state === "failed" ? describeErrorReason(status.error) : null;
  return { ...syncStatusTextOf(input), failureReason };
}

function syncStatusTextOf({ status, now, unsyncedCount, automatic }: SyncStatusInput): { text: string; dotClass: string } {
  if (status === null) {
    return { text: translate("sync.notConfigured"), dotClass: "off" };
  }
  if (status.state === "delegated") {
    return { text: translate("sync.delegated"), dotClass: "off" };
  }
  if (status.state === "syncing") {
    return { text: syncingTextOf(status.progress), dotClass: "syncing" };
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

// 同期中の文。件数の分かる段階（受信・送信）に入っていれば、件数も出す（最初の同期は数千件になることがある）。
function syncingTextOf(progress: SyncProgress | null): string {
  if (progress === null || progress.total === 0) {
    return translate("sync.syncing");
  }
  const counts = { done: formatCount(progress.done), total: formatCount(progress.total) };
  return translate(progress.direction === "receiving" ? "sync.receivingCount" : "sync.sendingCount", counts);
}

export function SyncStatusLine({ status, onOpenSyncSettings }: { status: SyncStatus | null; onOpenSyncSettings: () => void }) {
  const unsyncedCount = useContext(UnsyncedRecordsContext).size;
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), RELATIVE_TIME_REFRESH_MILLISECONDS);
    return () => clearInterval(timer);
  }, []);
  const { autoSync: automatic } = useDevicePreferences();
  const { text, dotClass, failureReason } = describeSyncStatus({ status, now, unsyncedCount, automatic });
  return (
    // 失敗の理由と、狭い列で切れる件数の文は、title で全文を読めるようにする。
    <button className="sync-line" title={failureReason === null ? (status?.state === "syncing" ? text : undefined) : translate("sync.failureReason", { status: text, reason: failureReason })}
      onClick={() => onOpenSyncSettings()}>
      {failureReason === null ? <span className={`status-dot ${dotClass}`} /> : <TriangleAlert size={ICON_SIZE.chip} className="sync-failure-mark" />}
      <span className="sync-line-text">{text}</span>
    </button>
  );
}
