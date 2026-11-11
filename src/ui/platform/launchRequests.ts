// Android で、アプリの外から頼まれたこと（ほかのアプリの「共有」、ウィジェットやショートカットの「新しいメモ」）の
// 窓口。ネイティブ側（LaunchRequestBridge.kt）が覚えているものを、画面が取りに行く。ほかの環境には窓口が無い。

// MainActivity.kt の LAUNCH_BRIDGE_NAME・LAUNCH_REQUEST_EVENT と揃える。
const LAUNCH_BRIDGE_NAME = "SedumNoteLaunch";
const LAUNCH_REQUEST_EVENT = "sedum-note-launch-request";

export type NativeLaunchBridge = {
  takeNewNoteRequest: () => boolean;
  describePendingShare: () => string;
  // Base64 の文字列。終わりに達したら空、読めなかったときは「!」。
  readPendingFileChunk: (fileIndex: number, offset: number, length: number) => string;
  clearPendingShare: () => void;
};

export function nativeLaunchBridge(): NativeLaunchBridge | null {
  return (window as unknown as Record<string, NativeLaunchBridge | undefined>)[LAUNCH_BRIDGE_NAME] ?? null;
}

// 「新しいメモ」を頼まれていたら true を返す。1 回取ると、ネイティブ側は忘れる。
export function takeNewNoteRequest(): boolean {
  return nativeLaunchBridge()?.takeNewNoteRequest() ?? false;
}

// アプリを開いている間に頼まれごとが届いたときに呼ばれる。
export function subscribeToLaunchRequests(listener: () => void): () => void {
  window.addEventListener(LAUNCH_REQUEST_EVENT, listener);
  return () => window.removeEventListener(LAUNCH_REQUEST_EVENT, listener);
}
