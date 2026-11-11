// 復号した添付やバックアップを、利用者の選んだ場所にファイルとして保存する。
//
// アプリ（Tauri）では、保存のダイアログで場所を選んでもらい、fs のプラグインで書く。
// WebView は <a download> でのダウンロードが OS ごとに違う（効かないものがある）ため。
// Web 版では、ブラウザのダウンロードにする。

import { save as chooseSavePath } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import { isRunningInTauri } from "./runtime";

// バックアップのファイルの拡張子。初回の画面のファイルの選択でも使う。
export const BACKUP_FILE_EXTENSION = "sedumbackup";

export type FileToSave = {
  suggestedName: string;
  // ファイルに書く順の部品。大きなバックアップを 1 つにつなげてメモリを倍使わないよう、順に書く。
  parts: Uint8Array[];
  mimeType: string;
};

// 保存したら true。利用者が場所の選択をやめたら false。
export async function saveFile(file: FileToSave): Promise<boolean> {
  if (!isRunningInTauri()) {
    downloadInBrowser(file);
    return true;
  }
  const path = await chooseSavePath({ defaultPath: file.suggestedName });
  if (path === null) {
    return false;
  }
  await writeFile(path, new ReadableStream<Uint8Array>({
    start(controller) {
      file.parts.forEach((part) => controller.enqueue(part));
      controller.close();
    },
  }));
  return true;
}

function downloadInBrowser(file: FileToSave): void {
  const url = URL.createObjectURL(new Blob(file.parts as Array<Uint8Array<ArrayBuffer>>, { type: file.mimeType }));
  const link = document.createElement("a");
  link.href = url;
  link.download = file.suggestedName;
  link.click();
  // クリックの直後に URL を消すと、ブラウザによってはダウンロードが始まらない。
  setTimeout(() => URL.revokeObjectURL(url), URL_RELEASE_DELAY_MILLISECONDS);
}

// ダウンロードが始まるのを待ってから、メモリの上の URL を消すまでの時間。
const URL_RELEASE_DELAY_MILLISECONDS = 60_000;
