// 新しいバージョンがあるときに出す小さな知らせ。押すと設定（更新の欄）を開く。

import { ArrowUpCircle } from "lucide-react";
import { useContext } from "react";
import { translate } from "../i18n/translate";
import { AvailableUpdateContext } from "./useAvailableUpdate";

export function UpdateChip({ onOpenSettings }: { onOpenSettings: () => void }) {
  const availableUpdate = useContext(AvailableUpdateContext);
  if (availableUpdate === null) {
    return null;
  }
  return (
    <button type="button" className="update-chip" onClick={onOpenSettings}>
      <ArrowUpCircle size={14} />{translate("update.available", { version: availableUpdate.version })}
    </button>
  );
}
