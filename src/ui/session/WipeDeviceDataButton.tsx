// このデバイスのデータを消すボタン。何が失われるかを確認に出してから消す。
// 設定の画面と、ロック解除の画面（パスフレーズを忘れたとき）で使う。

import { useState } from "react";
import type { DeviceDataSummary } from "../../core/vault/vaultSession";
import { translate } from "../i18n/translate";
import { useDialogs } from "../shared/DialogProvider";
import { ProgressStatus } from "../shared/ProgressStatus";
import { useAsyncAction } from "../shared/useAsyncAction";
import type { VaultSession } from "./useVaultSession";

function confirmationMessage(summary: DeviceDataSummary): string {
  if (!summary.syncConfigured) {
    return translate("wipe.confirmLocalOnly", { count: summary.recordCount });
  }
  return summary.waitingForPushCount > 0
    ? translate("wipe.confirmUnsent", { count: summary.waitingForPushCount })
    : translate("wipe.confirmSynced");
}

export function WipeDeviceDataButton({ session }: { session: VaultSession }) {
  const dialogs = useDialogs();
  // 確かめている間は出さず、削除を始めてから「削除しています」を出す。
  const [erasing, setErasing] = useState(false);
  const wipe = useAsyncAction(async () => {
    const message = confirmationMessage(await session.summarizeDeviceData());
    if (!(await dialogs.confirm({ message, confirmLabel: translate("wipe.confirmLabel"), danger: true }))) {
      return;
    }
    setErasing(true);
    try {
      await session.wipeDeviceData();
    } finally {
      setErasing(false);
    }
  });
  return (
    <>
      {wipe.errorMessage && <div className="form-error" role="alert">{wipe.errorMessage}</div>}
      <div className="form-actions">
        {erasing && <ProgressStatus label={translate("wipe.working")} progress={null} />}
        <button type="button" className="danger-button" disabled={wipe.busy} onClick={() => void wipe.run(undefined)}>{translate("wipe.title")}</button>
      </div>
    </>
  );
}
