// このウィンドウで使う、マスターキーの受け渡し（unlockedKeyHandoff.ts）。キーを運ぶ道は、アプリと Web 版で分ける。
//   アプリ（Tauri）  出どころにこのアプリしかいないので、全部のウィンドウへ BroadcastChannel で運ぶ（platform/appWindowsKeyTransport.ts）
//   Web 版          出どころがほかのページと共有なので、このアプリが開いたウィンドウと開いてくれたウィンドウの間だけで、
//                   直接 postMessage する（platform/openerKeyTransport.ts）。ほかのタブは今どおりパスフレーズで解除する
// ロックの合図（キーを含まない）は、どちらも platform/crossWindowStorage.ts の合図で全部のウィンドウへ伝える。

import { createAppWindowsKeyTransport } from "../platform/appWindowsKeyTransport";
import { noteIdOfThisWindow } from "../platform/noteWindows";
import { createOpenerKeyTransport } from "../platform/openerKeyTransport";
import { isRunningInTauri } from "../platform/runtime";
import { isUnlockedInAnotherWindow } from "../platform/unlockedPresence";
import { UnlockedKeyHandoff } from "./unlockedKeyHandoff";
import { unlockedKeyOf } from "./unlockedSpaces";

// runningInTauri は、アプリの中で動いているか（試験で差し替える）。
export function createKeyHandoff({ runningInTauri }: { runningInTauri: boolean }): UnlockedKeyHandoff {
  const transport = runningInTauri ? createAppWindowsKeyTransport() : createOpenerKeyTransport({ isNoteWindow: noteIdOfThisWindow() !== null });
  return new UnlockedKeyHandoff({ transport, isUnlockedElsewhere: isUnlockedInAnotherWindow, keyOf: unlockedKeyOf });
}

let keyHandoff: UnlockedKeyHandoff | null = null;

export function keyHandoffOfThisApp(): UnlockedKeyHandoff {
  keyHandoff ??= createKeyHandoff({ runningInTauri: isRunningInTauri() });
  return keyHandoff;
}
