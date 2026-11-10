// 左の列の下の同期の状態。押すと設定を開く。

import { Lock } from "lucide-react";
import { useEffect, useState } from "react";
import type { SyncStatus } from "../../core/sync/autoSync";
import { translate } from "../i18n/translate";

// 「n分前」を更新する間隔。
const RELATIVE_TIME_REFRESH_MILLISECONDS = 30_000;

export function describeSyncStatus(status: SyncStatus | null, now: Date): { text: string; dotClass: string } {
  if (status === null) {
    return { text: translate("sync.notConfigured"), dotClass: "off" };
  }
  if (status.state === "syncing") {
    return { text: translate("sync.syncing"), dotClass: "syncing" };
  }
  if (status.state === "failed") {
    return { text: translate("sync.failed"), dotClass: "failed" };
  }
  if (status.lastSyncedAt === null) {
    return { text: translate("sync.never"), dotClass: "off" };
  }
  const minutes = Math.floor((now.getTime() - status.lastSyncedAt.getTime()) / 60_000);
  const time = minutes < 1 ? translate("sync.justNow") : translate("sync.minutesAgo", { count: minutes });
  return { text: translate("sync.synced", { time }), dotClass: "" };
}

export function SyncStatusLine({ status, onOpenSettings }: { status: SyncStatus | null; onOpenSettings: () => void }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), RELATIVE_TIME_REFRESH_MILLISECONDS);
    return () => clearInterval(timer);
  }, []);
  const { text, dotClass } = describeSyncStatus(status, now);
  return (
    <button className="sync-line" onClick={onOpenSettings}>
      <span className={`status-dot ${dotClass}`} />{text}
      <span className="encrypted"><Lock size={12} />{translate("sync.encrypted")}</span>
    </button>
  );
}
