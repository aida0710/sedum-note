// 文言の取り出し。今は日本語だけを持つ。言語を足すときは同じキーのカタログを足し、
// ここで画面の言語に合わせて選ぶ。

import { japaneseMessages, type MessageKey } from "./messages.ja";

export type { MessageKey };

export function translate(key: MessageKey, parameters: Record<string, string | number> = {}): string {
  return japaneseMessages[key].replace(/\{(\w+)\}/g, (placeholder, name: string) =>
    name in parameters ? String(parameters[name]) : placeholder,
  );
}
