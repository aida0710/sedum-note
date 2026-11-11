// 文言の取り出し。言語を足すときは、同じキーのカタログを足して catalogues に並べる。

import { type Language, languageInUse } from "./languageInUse";
import { englishMessages } from "./messages.en";
import { japaneseMessages, type MessageKey } from "./messages.ja";

export type { MessageKey };

const catalogues: Record<Language, Record<MessageKey, string>> = {
  ja: japaneseMessages,
  en: englishMessages,
};

export function translate(key: MessageKey, parameters: Record<string, string | number> = {}): string {
  return catalogues[languageInUse()][key].replace(/\{(\w+)\}/g, (placeholder, name: string) =>
    name in parameters ? String(parameters[name]) : placeholder,
  );
}
