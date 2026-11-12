// メモ・ノートブック・添付・デバイスの ID。S3 のキーにそのまま使うので、
// 中身を推測させない 128 ビットの乱数を 16 進で表す。

import { bytesToHex } from "./hex";

const ID_BYTES = 16;

export function newRandomId(): string {
  return bytesToHex(crypto.getRandomValues(new Uint8Array(ID_BYTES)));
}

export function isRandomId(text: string): boolean {
  return /^[0-9a-f]{32}$/.test(text);
}
