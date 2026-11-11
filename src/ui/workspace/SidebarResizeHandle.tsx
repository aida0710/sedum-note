// 左の列の右の端。ドラッグすると列の幅が変わり、設定に覚える。ダブルクリックで元の幅に戻す。

import { translate } from "../i18n/translate";
import { clampSidebarWidth, DEFAULT_DEVICE_PREFERENCES, updateDevicePreferences } from "../preferences/devicePreferences";

export function SidebarResizeHandle() {
  const startResizing = (event: React.PointerEvent<HTMLDivElement>) => {
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    // 列は画面の左端から始まるので、ポインターの位置がそのまま幅になる。
    const resize = (moved: PointerEvent) => updateDevicePreferences({ sidebarWidth: clampSidebarWidth(moved.clientX) });
    handle.addEventListener("pointermove", resize);
    handle.addEventListener("pointerup", () => handle.removeEventListener("pointermove", resize), { once: true });
  };
  return (
    <div className="sidebar-resize-handle" role="separator" aria-orientation="vertical" aria-label={translate("sidebar.resize")}
      onPointerDown={startResizing}
      onDoubleClick={() => updateDevicePreferences({ sidebarWidth: DEFAULT_DEVICE_PREFERENCES.sidebarWidth })} />
  );
}
