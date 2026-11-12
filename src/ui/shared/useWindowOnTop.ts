// このウィンドウを、ほかのウィンドウより前に出したままにしているか。ウィンドウごとの状態で、開き直すと外れる。

import { useSyncExternalStore } from "react";
import { keepWindowOnTop } from "../platform/noteWindows";

let windowIsOnTop = false;
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useWindowOnTop(): { windowIsOnTop: boolean; toggleWindowOnTop: () => Promise<void> } {
  const current = useSyncExternalStore(subscribe, () => windowIsOnTop);
  return {
    windowIsOnTop: current,
    toggleWindowOnTop: async () => {
      await keepWindowOnTop(!windowIsOnTop);
      windowIsOnTop = !windowIsOnTop;
      listeners.forEach((listener) => listener());
    },
  };
}
