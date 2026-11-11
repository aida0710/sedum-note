// テーマの見本。左の列・メモの地・文字・アクセントの色を小さく描く。

import type { CSSProperties } from "react";
import { translate } from "../i18n/translate";
import { themeCssVariables } from "../theme/applyAppearance";
import type { ThemeColors } from "../theme/themeColors";

export function ThemeSample({ colors }: { colors: ThemeColors }) {
  return (
    <div className="theme-sample" style={themeCssVariables(colors) as CSSProperties} aria-hidden="true">
      <div className="theme-sample-sidebar"><span /><span /><span /></div>
      <div className="theme-sample-body">
        <span>{translate("theme.sampleText")}</span>
        <span className="sample-muted">{translate("theme.sampleMuted")}</span>
        <span className="sample-accent">{translate("theme.sampleLink")}</span>
      </div>
    </div>
  );
}
