// ロックを解除したときに、新しいバージョンがあるかを 1 回確かめる。設定で止められる。

import { createContext, useEffect, useState } from "react";
import { useDevicePreferences } from "../preferences/devicePreferences";
import { type AvailableUpdate, findAvailableUpdate } from "./availableUpdate";

export const AvailableUpdateContext = createContext<AvailableUpdate | null>(null);

export function useAvailableUpdate(): AvailableUpdate | null {
  const { checkForUpdates } = useDevicePreferences();
  const [availableUpdate, setAvailableUpdate] = useState<AvailableUpdate | null>(null);
  useEffect(() => {
    if (!checkForUpdates) {
      setAvailableUpdate(null);
      return;
    }
    let cancelled = false;
    void findAvailableUpdate().then((found) => {
      if (!cancelled) {
        setAvailableUpdate(found);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [checkForUpdates]);
  return availableUpdate;
}
