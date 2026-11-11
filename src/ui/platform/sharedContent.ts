// Android で、ほかのアプリの「共有」から受け取った文字とファイル。ネイティブ側
// （SharedContentBridge.kt）がメモリに持っているものを読む。ほかの環境では、いつも「無い」。

import { base64ToBytes } from "../../core/crypto/base64";

// MainActivity.kt の SHARE_BRIDGE_NAME・SHARE_ARRIVED_EVENT と揃える。
const SHARE_BRIDGE_NAME = "SedumNoteShare";
const SHARE_ARRIVED_EVENT = "sedum-note-share";
// 1 回に読む大きさ。Base64 の文字列として WebView へ渡るので、大きくしすぎない。
const FILE_CHUNK_BYTES = 1024 * 1024;

type NativeShareBridge = {
  describePendingShare: () => string;
  readPendingFileChunk: (fileIndex: number, offset: number, length: number) => string;
  clearPendingShare: () => void;
};

export type SharedFile = {
  fileName: string;
  mimeType: string;
  // 共有元が大きさを教えないこともある。そのときは null。
  byteLength: number | null;
  // 中身を読む。maxBytes を超えたら null（読みかけは捨てる）。
  read: (maxBytes: number) => Uint8Array | null;
};

export type SharedContent = { subject: string; text: string; files: SharedFile[] };

function nativeShareBridge(): NativeShareBridge | null {
  return (window as unknown as Record<string, NativeShareBridge | undefined>)[SHARE_BRIDGE_NAME] ?? null;
}

export function pendingSharedContent(): SharedContent | null {
  const bridge = nativeShareBridge();
  const described = bridge?.describePendingShare() ?? "";
  if (!bridge || described === "") {
    return null;
  }
  const share = JSON.parse(described) as { subject: string; text: string; files: Array<{ fileName: string; mimeType: string; byteLength: number }> };
  return {
    subject: share.subject,
    text: share.text,
    files: share.files.map((file, fileIndex) => ({
      fileName: file.fileName,
      mimeType: file.mimeType,
      byteLength: file.byteLength < 0 ? null : file.byteLength,
      read: (maxBytes) => readSharedFile(bridge, fileIndex, maxBytes),
    })),
  };
}

function readSharedFile(bridge: NativeShareBridge, fileIndex: number, maxBytes: number): Uint8Array | null {
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  for (;;) {
    const chunk = base64ToBytes(bridge.readPendingFileChunk(fileIndex, byteLength, FILE_CHUNK_BYTES));
    if (chunk.length === 0) {
      break;
    }
    chunks.push(chunk);
    byteLength += chunk.length;
    if (byteLength > maxBytes) {
      return null;
    }
  }
  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}

// 受け取り終えたら呼ぶ。ネイティブ側が中身を忘れる。
export function clearPendingSharedContent(): void {
  nativeShareBridge()?.clearPendingShare();
}

// アプリを開いている間に共有されたときに呼ばれる。
export function subscribeToSharedContent(listener: () => void): () => void {
  window.addEventListener(SHARE_ARRIVED_EVENT, listener);
  return () => window.removeEventListener(SHARE_ARRIVED_EVENT, listener);
}
