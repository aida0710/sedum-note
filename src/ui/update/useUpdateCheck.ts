// 新しいバージョンがあるかを確かめた状態を、画面（設定の「更新」のページと、更新の知らせ）に配る。
//
// アプリは、ロックを解除したときに 1 回確かめる（設定で止められる）。Web 版は、開くたびに置いてある最新のものが
// 届くので、自分からは確かめない。どちらも、設定の「更新を確認する」でいつでも確かめられる。

import { createContext, useEffect, useMemo, useState } from "react";
import { isRunningInTauri } from "../platform/runtime";
import { useDevicePreferences } from "../preferences/devicePreferences";
import { type AvailableUpdate, checkForUpdate } from "./availableUpdate";
import { NOT_CHECKED, type UpdateCheckState, UpdateChecks } from "./updateChecks";

export type UpdateCheck = UpdateCheckState & {
  checkNow: () => void;
};

export const UpdateCheckContext = createContext<UpdateCheck>({ ...NOT_CHECKED, checkNow: () => undefined });

export function useUpdateCheck(): UpdateCheck {
  const { checkForUpdates } = useDevicePreferences();
  const [state, setState] = useState<UpdateCheckState>(NOT_CHECKED);
  const checks = useMemo(() => new UpdateChecks({ query: checkForUpdate, now: () => new Date(), show: setState }), []);
  useEffect(() => {
    if (!isRunningInTauri()) {
      return;
    }
    if (checkForUpdates) {
      void checks.check();
    } else {
      checks.clear();
    }
  }, [checks, checkForUpdates]);
  return { ...state, checkNow: () => void checks.check() };
}

export function availableUpdateOf(updateCheck: UpdateCheckState): AvailableUpdate | null {
  const result = updateCheck.last?.result;
  return result?.kind === "available" ? result.update : null;
}
