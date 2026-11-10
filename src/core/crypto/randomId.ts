// メモ・ノートブック・添付・デバイスの ID。S3 のキーにそのまま使うので、
// 中身を推測させない 128 ビットの乱数を 16 進で表す。

const ID_BYTES = 16;

export function newRandomId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(ID_BYTES));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function isRandomId(text: string): boolean {
  return /^[0-9a-f]{32}$/.test(text);
}
