// 画面に出す日時の形。

const dateFormatter = new Intl.DateTimeFormat("ja-JP", { month: "long", day: "numeric" });
const dateTimeFormatter = new Intl.DateTimeFormat("ja-JP", { month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" });

export function formatShortDate(iso: string): string {
  return dateFormatter.format(new Date(iso));
}

export function formatDateTime(iso: string): string {
  return dateTimeFormatter.format(new Date(iso));
}
