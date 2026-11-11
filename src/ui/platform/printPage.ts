// 開いている画面を印刷する（OS の印刷の画面から PDF にも保存できる）。印刷のときの見た目は app.css の
// @media print が決める。Android のアプリには印刷の画面を出す手段が無い。

import { invoke } from "@tauri-apps/api/core";
import { isRunningInTauri } from "./runtime";

// 印刷の前に、写真が描かれるのを待つ上限。
const IMAGE_WAIT_MILLISECONDS = 5_000;

function isAndroidApp(): boolean {
  return isRunningInTauri() && /Android/i.test(navigator.userAgent);
}

export function isPrintAvailable(): boolean {
  return !isAndroidApp();
}

export async function printPage(): Promise<void> {
  await waitForImages();
  if (isRunningInTauri()) {
    await invoke("print_window");
  } else {
    window.print();
  }
}

// 復号の終わっていない写真は、印刷に写らない。描かれるまで待つ（待ちすぎない）。
async function waitForImages(): Promise<void> {
  const pending = [...document.querySelectorAll<HTMLImageElement>(".ProseMirror img")].filter((image) => !image.complete);
  const loaded = Promise.all(pending.map((image) => new Promise((resolve) => {
    image.addEventListener("load", resolve, { once: true });
    image.addEventListener("error", resolve, { once: true });
  })));
  await Promise.race([loaded, new Promise((resolve) => setTimeout(resolve, IMAGE_WAIT_MILLISECONDS))]);
}
