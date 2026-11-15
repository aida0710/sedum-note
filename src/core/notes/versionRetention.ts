// 履歴を残す数と期間の決まり。手元でも同期先でも同じ決まりで消す。

// 1 件のメモに残す履歴の数。超えたら古いものから消す。書くのを 3 分止めるたびに 1 つ増えるので、
// 50 件では、よく書くメモの数時間分にしかならなかった。
export const MAX_VERSIONS_PER_NOTE = 200;
// 履歴を残す日数。これより前に残した履歴は消す。
export const VERSION_RETENTION_DAYS = 90;

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

// 1 件のメモの履歴のうち、決まりから外れて消すもの（新しい方から MAX_VERSIONS_PER_NOTE 件に入らないか、
// VERSION_RETENTION_DAYS 日より前に残したもの）。
export function versionsToRemove<Version extends { capturedAtMilliseconds: number }>(versionsOfOneNote: Version[], now: Date): Version[] {
  const oldestKeptTime = now.getTime() - VERSION_RETENTION_DAYS * MILLISECONDS_PER_DAY;
  return [...versionsOfOneNote]
    .sort((left, right) => right.capturedAtMilliseconds - left.capturedAtMilliseconds)
    .filter((version, index) => index >= MAX_VERSIONS_PER_NOTE || version.capturedAtMilliseconds < oldestKeptTime);
}
