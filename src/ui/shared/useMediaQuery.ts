import { useSyncExternalStore } from "react";

// スマホの組み方に切り替える幅。案Cの PC の組み方（木 290px＋エディタ）が収まらない幅。
export const MOBILE_LAYOUT_QUERY = "(max-width: 760px)";

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
  );
}
