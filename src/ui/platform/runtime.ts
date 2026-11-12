// いまアプリ（Tauri）の中で動いているか、ブラウザ（Web 版）で動いているか。

export function isRunningInTauri(): boolean {
  return "__TAURI_INTERNALS__" in window;
}

// Android のアプリ（Tauri の WebView）の中か。デスクトップのアプリにだけある機能（MCP の窓口、印刷）を出し分ける。
export function isAndroidApp(): boolean {
  return isRunningInTauri() && /Android/i.test(navigator.userAgent);
}

// ウィンドウを閉じても動かしたままにできるか（Windows と Mac のアプリだけ。通知の領域やメニューバーに常駐する）。
export function canStayResident(): boolean {
  return isRunningInTauri() && !isAndroidApp() && /Win|Mac/.test(navigator.platform);
}
