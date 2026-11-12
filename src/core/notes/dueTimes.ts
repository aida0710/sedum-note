// 期限の時刻の表し方。期限は「その土地の時計で何日の何時」の形（YYYY-MM-DDTHH:MM）で持ち、タイムゾーンを付けない。
// 開いているデバイスの時計で読むので、どのデバイスでも「15 日の 9:00」は、そのデバイスの 15 日の 9:00 になる。
//
// チェックリストの項目の期限は、項目の文字の中に「📅 2026-11-15 09:00」の形で書く（Obsidian の Tasks と同じ印）。
// 文字なので、Markdown の書き出し・取り込み・貼り付け・MCP でも、そのまま往復する。時刻を省くと DEFAULT_DUE_TIME_OF_DAY。

export const DUE_MARK = "📅";
// 時刻を書かなかった期限を、何時として扱うか（朝のうちに知らせる）。
export const DEFAULT_DUE_TIME_OF_DAY = "09:00";

const DUE_TIME_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;
// 文字の中の期限の印。日付と時刻の間は、空白 1 つか「T」。エディタで打った空白は、改行しない空白（U+00A0）に
// なっていることがあるので、空白はどの種類でも受け付ける。
const DUE_MARK_PATTERN = /📅\s?(\d{4}-\d{2}-\d{2})(?:[\sT](\d{1,2}:\d{2}))?/u;

// 実在する日時の、期限の形の文字か。
export function isDueTime(value: unknown): value is string {
  return typeof value === "string" && dueTimeAsDate(value) !== null;
}

// 期限を、このデバイスの時計の Date にする。形が違うか、実在しない日時なら null。
export function dueTimeAsDate(dueAt: string): Date | null {
  const match = DUE_TIME_PATTERN.exec(dueAt);
  if (!match) {
    return null;
  }
  const [year, month, day, hour, minute] = match.slice(1).map(Number) as [number, number, number, number, number];
  const date = new Date(year, month - 1, day, hour, minute);
  // 2 月 31 日のような日付は、Date が翌月へ繰り上げる。繰り上がったものは実在しない日時として扱う。
  const isSameDay = date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day && date.getHours() === hour && date.getMinutes() === minute;
  return isSameDay ? date : null;
}

const twoDigits = (value: number) => String(value).padStart(2, "0");

// Date を、このデバイスの時計での期限の形にする。
export function dueTimeOf(date: Date): string {
  return `${date.getFullYear()}-${twoDigits(date.getMonth() + 1)}-${twoDigits(date.getDate())}T${twoDigits(date.getHours())}:${twoDigits(date.getMinutes())}`;
}

// 文字の中に書く期限の印。
export function dueMarkText(dueAt: string): string {
  return `${DUE_MARK} ${dueAt.replace("T", " ")}`;
}

export type DueMarkInText = { dueAt: string; start: number; end: number };

// 文字の中の、最初の期限の印。無いか、実在しない日時なら null。
export function findDueMark(text: string): DueMarkInText | null {
  const match = DUE_MARK_PATTERN.exec(text);
  if (!match) {
    return null;
  }
  const [hour, minute] = (match[2] ?? DEFAULT_DUE_TIME_OF_DAY).split(":") as [string, string];
  const dueAt = `${match[1]}T${hour.padStart(2, "0")}:${minute}`;
  return isDueTime(dueAt) ? { dueAt, start: match.index, end: match.index + match[0].length } : null;
}
