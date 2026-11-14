import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./ui/App";
import { deleteCapturedPhotos } from "./ui/platform/capturedPhotos";
import { isRunningInTauri } from "./ui/platform/runtime";
import { stopMcpGateway } from "./ui/platform/mcpGateway";
import { trackVisibleViewport } from "./ui/platform/visibleViewport";
import { readDevicePreferences } from "./ui/preferences/devicePreferences";
import { keyHandoffOfThisApp } from "./ui/session/keyHandoffOfThisApp";
import { followLocksOfOtherWindows } from "./ui/session/unlockedSpaces";
import "./ui/styles/app.css";
import { applyAppearance } from "./ui/theme/applyAppearance";
import { resolveTheme, SYSTEM_DARK_QUERY } from "./ui/theme/themeInUse";

trackVisibleViewport();
// 画面を読み込み直した（データを消した、など）ときに、前の画面が開いた MCP の窓口が残らないようにする。
if (__INCLUDES_MCP__ && isRunningInTauri()) {
  void stopMcpGateway();
}
// 前の起動で、添付にする前に閉じられて残った、カメラの一時ファイル（Android）を消す。
deleteCapturedPhotos();
// ロックを全部のウィンドウで共通にする。ほかのウィンドウでロックしたらこのウィンドウもロックし、ほかのウィンドウ（開いたばかりの
// 別のウィンドウなど）に頼まれたら、このウィンドウで解除しているスペースのキーを渡す。
followLocksOfOtherWindows();
keyHandoffOfThisApp().answerRequests();

// 最初に描く前に色を入れる（描いたあとに入れると、色の無い画面が一瞬見える）。
const preferences = readDevicePreferences();
applyAppearance({
  theme: resolveTheme(preferences, window.matchMedia(SYSTEM_DARK_QUERY).matches),
  editorTypography: preferences.editorTypography,
  sidebarWidth: preferences.sidebarWidth,
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
