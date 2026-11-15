// 2 つのバイト列が同じ中身か。暗号文が書き換わったかを見るのに使う（秘密の値の比較には使わない。時間が中身で変わる）。
export function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.length === right.length && left.every((byte, index) => byte === right[index]);
}
