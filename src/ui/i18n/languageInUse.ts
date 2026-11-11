// 画面に使う言語を決める。設定が「システムに合わせる」なら、ブラウザの言語の並びから選ぶ。

import { type LanguageChoice, readDevicePreferences } from "../preferences/devicePreferences";

export const SUPPORTED_LANGUAGES = ["ja", "en"] as const;
export type Language = (typeof SUPPORTED_LANGUAGES)[number];

// どの言語にも当たらないときの言語。
const FALLBACK_LANGUAGE: Language = "en";

export function resolveLanguage(choice: LanguageChoice, systemLanguages: readonly string[]): Language {
  if (choice !== "system") {
    return choice;
  }
  for (const systemLanguage of systemLanguages) {
    const primary = systemLanguage.toLowerCase().split("-")[0];
    const supported = SUPPORTED_LANGUAGES.find((language) => language === primary);
    if (supported) {
      return supported;
    }
  }
  return FALLBACK_LANGUAGE;
}

export function languageInUse(): Language {
  return resolveLanguage(readDevicePreferences().language, typeof navigator === "undefined" ? [] : navigator.languages);
}
