// ウィンドウを閉じても、アプリを動かしたままにする設定を、アプリの側（src-tauri/src/resident.rs）へ伝える。

import { invoke } from "@tauri-apps/api/core";

export type ResidentAppSetting = {
  enabled: boolean;
  // 常駐のアイコンのメニューに出す文言。
  showLabel: string;
  quitLabel: string;
};

export function applyResidentAppSetting(setting: ResidentAppSetting): Promise<void> {
  return invoke("set_resident", setting);
}
