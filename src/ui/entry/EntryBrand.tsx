// 最初の画面とロックの画面の、カードのいちばん上に置くアプリのアイコンと名前。何のアプリの画面かを、題より先に見せる。

import { translate } from "../i18n/translate";
import { AppIcon } from "../shared/AppIcon";

// アイコンの大きさ（px）。名前の文字（欄の見出しの大きさ）の 2 行ぶんほど。
const BRAND_ICON_SIZE = 28;

export function EntryBrand() {
  return (
    <div className="entry-brand">
      <AppIcon size={BRAND_ICON_SIZE} />
      <span>{translate("app.name")}</span>
    </div>
  );
}
