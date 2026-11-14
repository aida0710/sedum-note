// メモを 1 つだけ開く、別のウィンドウ。アプリ（Tauri）ではウィンドウを作り、Web 版ではブラウザの別のウィンドウを開く。
// 別のウィンドウは、開くメモの ID を URL（?note=<ID>）で受け取る。ロックは全部のウィンドウで共通で、開いた側がロックを解除して
// いれば、別のウィンドウはパスフレーズを聞かずに、そのキーで開く（session/unlockedKeyHandoff.ts）。キーは URL にも保存にも置かず、
// アプリではウィンドウの間の BroadcastChannel、Web 版では開いたウィンドウとの直接の postMessage で渡す。

import { isRandomId, newRandomId } from "../../core/crypto/randomId";
import { rememberOpenedWindow } from "./openerKeyTransport";
import { isAndroidApp, isRunningInTauri } from "./runtime";

const NOTE_PARAMETER = "note";
// 別のウィンドウが開くメモの、スペース（ui/session/spaceRegistry.ts）。
const SPACE_PARAMETER = "space";
// 別のウィンドウの最初の大きさ（px）。スマホの組み方に切り替わらない幅（760px より広い）にする。
const NOTE_WINDOW_SIZE = { width: 860, height: 820 };
// アプリのウィンドウの名前の先頭。この名前のウィンドウに、画面の権限を与えてある（src-tauri/capabilities/default.json）。
const NOTE_WINDOW_LABEL_PREFIX = "note-";

// このウィンドウが、メモを 1 つだけ開く別のウィンドウなら、そのメモの ID。ふつうのウィンドウなら null。
export function noteIdOfThisWindow(): string | null {
  const noteId = new URLSearchParams(window.location.search).get(NOTE_PARAMETER);
  return noteId !== null && isRandomId(noteId) ? noteId : null;
}

// このウィンドウが、メモを 1 つだけ開く別のウィンドウなら、そのメモのスペースの ID。ふつうのウィンドウなら null。
export function spaceIdOfThisWindow(): string | null {
  const parameters = new URLSearchParams(window.location.search);
  return noteIdOfThisWindow() === null ? null : parameters.get(SPACE_PARAMETER);
}

// メモを別のウィンドウで開けるか（Android のアプリは、ウィンドウが 1 つだけ）。
export function canOpenNoteWindows(): boolean {
  return !isAndroidApp();
}

export async function openNoteInNewWindow({ noteId, spaceId, title }: { noteId: string; spaceId: string; title: string }): Promise<void> {
  const query = `?${NOTE_PARAMETER}=${noteId}&${SPACE_PARAMETER}=${encodeURIComponent(spaceId)}`;
  if (!isRunningInTauri()) {
    // 開いたウィンドウだけが、このウィンドウにキーを頼める（openerKeyTransport.ts）。ブラウザが開くのを止めたら null。
    const opened = window.open(`${window.location.pathname}${query}`, "_blank", `popup,width=${NOTE_WINDOW_SIZE.width},height=${NOTE_WINDOW_SIZE.height}`);
    if (opened !== null) {
      rememberOpenedWindow(opened);
    }
    return;
  }
  const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
  // dragDropEnabled を切るのは、最初のウィンドウと同じ理由（本文へのドラッグを、ページの中で受けるため）。
  const noteWindow = new WebviewWindow(`${NOTE_WINDOW_LABEL_PREFIX}${newRandomId()}`, { url: `index.html${query}`, title, ...NOTE_WINDOW_SIZE, dragDropEnabled: false });
  // ウィンドウを作れたか・作れなかったかは、出来事として届く。作れなかったら、呼び出し側へ失敗として返す。
  await new Promise<void>((resolve, reject) => {
    void noteWindow.once("tauri://created", () => resolve());
    void noteWindow.once("tauri://error", (event) => reject(new Error(`the window could not be opened: ${String(event.payload)}`)));
  });
}

// ウィンドウを、ほかのウィンドウより前に出したままにできるか（PC のアプリだけ）。
export function canKeepWindowOnTop(): boolean {
  return isRunningInTauri() && !isAndroidApp();
}

export async function keepWindowOnTop(onTop: boolean): Promise<void> {
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  await getCurrentWindow().setAlwaysOnTop(onTop);
}

// ウィンドウの名前（タイトルバーと、ウィンドウの一覧に出る）を変える。
export async function setWindowTitle(title: string): Promise<void> {
  if (!isRunningInTauri()) {
    document.title = title;
    return;
  }
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  await getCurrentWindow().setTitle(title);
}
