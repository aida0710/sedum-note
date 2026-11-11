// 書き出すファイルの名前に入れる日付（例: 20261111）。

export function fileNameDate(now: Date): string {
  return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
}
