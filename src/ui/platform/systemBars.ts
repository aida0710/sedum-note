// Android で、ステータスバーとナビゲーションバーの所の色を、選んだテーマに合わせる。
// ネイティブ側（SystemBarsBridge.kt）へ色を伝える。ほかの環境では何もしない。

// MainActivity.kt の SYSTEM_BARS_BRIDGE_NAME と揃える。
const SYSTEM_BARS_BRIDGE_NAME = "SedumNoteSystemBars";

type NativeSystemBarsBridge = { setSystemBarColors: (backgroundColor: string, isDark: boolean) => void };

export function applySystemBarColors({ backgroundColor, isDark }: { backgroundColor: string; isDark: boolean }): void {
  const bridge = (window as unknown as Record<string, NativeSystemBarsBridge | undefined>)[SYSTEM_BARS_BRIDGE_NAME];
  bridge?.setSystemBarColors(backgroundColor, isDark);
}
