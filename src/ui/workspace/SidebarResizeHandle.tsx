// 左の列の右の端。ドラッグすると列の幅が変わり、設定に覚える。ダブルクリックで元の幅に戻す。
// キーボードでは、Tab で止まり、← → で幅を変え、Home と End でいちばん狭く・広くする。

import { translate } from "../i18n/translate";
import { clampSidebarWidth, DEFAULT_DEVICE_PREFERENCES, readDevicePreferences, SIDEBAR_WIDTH_RANGE, updateDevicePreferences, useDevicePreferences } from "../preferences/devicePreferences";
import { hasModifierKey } from "../shared/arrowKeyFocus";

// ← → で 1 回に変える幅（px）。数回押せば見て分かるほど変わり、合わせたい幅を行き過ぎにくい大きさ。
const KEYBOARD_RESIZE_STEP = 16;

// 押したキーごとの、変えたあとの幅。
const KEYBOARD_RESIZES: Record<string, (width: number) => number> = {
  ArrowLeft: (width) => width - KEYBOARD_RESIZE_STEP,
  ArrowRight: (width) => width + KEYBOARD_RESIZE_STEP,
  Home: () => SIDEBAR_WIDTH_RANGE.minimum,
  End: () => SIDEBAR_WIDTH_RANGE.maximum,
};

export function SidebarResizeHandle() {
  const { sidebarWidth } = useDevicePreferences();
  const startResizing = (event: React.PointerEvent<HTMLDivElement>) => {
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    // 列は画面の左端から始まるので、ポインターの位置がそのまま幅になる。
    const resize = (moved: PointerEvent) => updateDevicePreferences({ sidebarWidth: clampSidebarWidth(moved.clientX) });
    handle.addEventListener("pointermove", resize);
    handle.addEventListener("pointerup", () => handle.removeEventListener("pointermove", resize), { once: true });
  };
  const resizeByKey = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const resize = KEYBOARD_RESIZES[event.key];
    if (resize === undefined || hasModifierKey(event)) {
      return;
    }
    event.preventDefault();
    updateDevicePreferences({ sidebarWidth: clampSidebarWidth(resize(readDevicePreferences().sidebarWidth)) });
  };
  return (
    <div className="sidebar-resize-handle" role="separator" aria-orientation="vertical" aria-label={translate("sidebar.resize")} tabIndex={0}
      aria-valuenow={sidebarWidth} aria-valuemin={SIDEBAR_WIDTH_RANGE.minimum} aria-valuemax={SIDEBAR_WIDTH_RANGE.maximum}
      onPointerDown={startResizing} onKeyDown={resizeByKey}
      onDoubleClick={() => updateDevicePreferences({ sidebarWidth: DEFAULT_DEVICE_PREFERENCES.sidebarWidth })} />
  );
}
