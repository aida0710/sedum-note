import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./ui/App";
import { readDevicePreferences } from "./ui/preferences/devicePreferences";
import "./ui/styles/app.css";
import { applyAppearance } from "./ui/theme/applyAppearance";
import { resolveTheme, SYSTEM_DARK_QUERY } from "./ui/theme/themeInUse";

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
