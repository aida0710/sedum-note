// Android で、ほかのアプリの「共有」から受け取った文字とファイル。ネイティブ側
// （LaunchRequestBridge.kt）がメモリに持っているものを読む。ほかの環境では、いつも「無い」。

import { base64ToBytes } from "../../core/crypto/base64";
import { type NativeLaunchBridge, nativeLaunchBridge } from "./launchRequests";

// 読めなかったファイルの印。LaunchRequestBridge.kt の UNREADABLE_FILE_MARK と揃える。
const UNREADABLE_FILE_MARK = "!";
// 1 回に読む大きさ。Base64 の文字列として WebView へ渡るので、大きくしすぎない。
const FILE_CHUNK_BYTES = 1024 * 1024;

export type SharedFile = {
  fileName: string;
  mimeType: string;
  // 共有元が大きさを教えないこともある。そのときは null。
  byteLength: number | null;
  // 中身を読む。共有元から読めないときと、maxBytes を超えたときは null（読みかけは捨てる）。
  read: (maxBytes: number) => Uint8Array | null;
};

export type SharedContent = { subject: string; text: string; files: SharedFile[] };

export function pendingSharedContent(): SharedContent | null {
  const bridge = nativeLaunchBridge();
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

function readSharedFile(bridge: NativeLaunchBridge, fileIndex: number, maxBytes: number): Uint8Array | null {
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  for (;;) {
    const encodedChunk = bridge.readPendingFileChunk(fileIndex, byteLength, FILE_CHUNK_BYTES);
    if (encodedChunk === UNREADABLE_FILE_MARK) {
      return null;
    }
    const chunk = base64ToBytes(encodedChunk);
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
  nativeLaunchBridge()?.clearPendingShare();
}
