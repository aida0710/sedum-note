// 新しいバージョンがあるときに出す小さな知らせ。押すと設定の更新のページを開く。

import { ArrowUpCircle } from "lucide-react";
import { useContext } from "react";
import { translate } from "../i18n/translate";
import { availableUpdateOf, UpdateCheckContext } from "./useUpdateCheck";
import { ICON_SIZE } from "../shared/iconSizes";

export function UpdateChip({ onOpenSettings }: { onOpenSettings: () => void }) {
  const availableUpdate = availableUpdateOf(useContext(UpdateCheckContext));
  if (availableUpdate === null) {
    return null;
  }
  return (
    <button type="button" className="update-chip" onClick={() => onOpenSettings()}>
      <ArrowUpCircle size={ICON_SIZE.chip} />{translate("update.available", { version: availableUpdate.version })}
    </button>
  );
}
