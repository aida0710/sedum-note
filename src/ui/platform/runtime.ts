// いまアプリ（Tauri）の中で動いているか、ブラウザ（Web 版）で動いているか。

export function isRunningInTauri(): boolean {
  return "__TAURI_INTERNALS__" in window;
}
