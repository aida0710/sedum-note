// 外のページを、OS のブラウザで開く。アプリ（Tauri）の中からは、capabilities で許した URL
// （このアプリのリリースのページ）だけが開ける。

import { openUrl } from "@tauri-apps/plugin-opener";
import { isRunningInTauri } from "./runtime";

export async function openExternalUrl(url: string): Promise<void> {
  if (isRunningInTauri()) {
    await openUrl(url);
  } else {
    window.open(url, "_blank", "noopener");
  }
}
