// Android のアプリで、押したとき・指で動かしてしきい値を越えたときに、短く振動させて手応えを返す
// （チェックリストのチェック、設定のスイッチ、一覧を払う・引く操作）。
// Web 版・PC のアプリと、設定（devicePreferences の hapticFeedback）で切ったときは何もしない。
// WebView の navigator.vibrate を使う。AndroidManifest.xml の VIBRATE の権限が要る（無いと true を返すだけで振動しない）。
// 長押しで開くメニュー（contextmenu）では呼ばない。WebView が OS の長押しの振動（performHapticFeedback の LONG_PRESS）を
// 出し、こちらの振動はそれに打ち消される（エミュレーターの記録で cancelled_superseded）。

import { readDevicePreferences } from "../preferences/devicePreferences";
import { isAndroidApp } from "./runtime";

// 1 回の振動の長さ（ms）。押したと指で分かる短さ。長くすると、通知が来たときの振動のように感じる。
const HAPTIC_FEEDBACK_MILLISECONDS = 12;

export function giveHapticFeedback(): void {
  if (!isAndroidApp() || !readDevicePreferences().hapticFeedback) {
    return;
  }
  navigator.vibrate(HAPTIC_FEEDBACK_MILLISECONDS);
}
