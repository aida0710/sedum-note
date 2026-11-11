import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./ui/App";
import { deleteCapturedPhotos } from "./ui/platform/capturedPhotos";
import { stopMcpGateway } from "./ui/platform/mcpGateway";
import { trackVisibleViewport } from "./ui/platform/visibleViewport";
import { readDevicePreferences } from "./ui/preferences/devicePreferences";
import "./ui/styles/app.css";
import { applyAppearance } from "./ui/theme/applyAppearance";
import { resolveTheme, SYSTEM_DARK_QUERY } from "./ui/theme/themeInUse";

trackVisibleViewport();
// 画面を読み込み直した（データを消した、など）ときに、前の画面が開いた MCP の窓口が残らないようにする。
void stopMcpGateway();
// 前の起動で、添付にする前に閉じられて残った、カメラの一時ファイル（Android）を消す。
deleteCapturedPhotos();

// 最初に描く前に色を入れる（描いたあとに入れると、色の無い画面が一瞬見える）。
const preferences = readDevicePreferences();
applyAppearance({
  theme: resolveTheme(preferences, window.matchMedia(SYSTEM_DARK_QUERY).matches),
  editorFontSize: preferences.editorFontSize,
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
