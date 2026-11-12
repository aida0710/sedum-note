// アプリが作るファイル（録音、スキャン）の名前。種類の名前のあとに、作った日時を付ける。

// 例: 録音 2026-11-12 15.04.webm（ファイル名に使えない「:」を避ける）。
export function timestampedFileName(input: { label: string; createdAt: Date; extension: string }): string {
  const { label, createdAt, extension } = input;
  const twoDigits = (value: number) => String(value).padStart(2, "0");
  const date = `${createdAt.getFullYear()}-${twoDigits(createdAt.getMonth() + 1)}-${twoDigits(createdAt.getDate())}`;
  const time = `${twoDigits(createdAt.getHours())}.${twoDigits(createdAt.getMinutes())}`;
  return `${label} ${date} ${time}.${extension}`;
}
