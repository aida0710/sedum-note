// 件数を、画面の言語の桁区切りで書く（2000 → 「2,000」）。

import { languageInUse } from "../i18n/languageInUse";

export function formatCount(count: number): string {
  return new Intl.NumberFormat(languageInUse()).format(count);
}
