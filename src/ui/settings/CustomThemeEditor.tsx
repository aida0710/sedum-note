// 自作のテーマの色を選ぶ欄。読みにくい組み合わせのうちは保存できない。

import { useState } from "react";
import { translate } from "../i18n/translate";
import { CUSTOM_THEME_NAME_MAX_LENGTH, type CustomTheme, findContrastProblems, schemeOfColors } from "../theme/customTheme";
import { THEME_COLOR_NAMES, type ThemeColorName } from "../theme/themeColors";
import { ThemeSample } from "./ThemeSample";
import { preventSubmitByImeKey } from "../shared/imeKeyEvent";

type CustomThemeEditorProps = {
  initialTheme: CustomTheme;
  onSave: (theme: CustomTheme) => void;
  onCancel: () => void;
};

export function CustomThemeEditor({ initialTheme, onSave, onCancel }: CustomThemeEditorProps) {
  const [name, setName] = useState(initialTheme.name);
  const [colors, setColors] = useState(initialTheme.colors);
  const problems = findContrastProblems(colors);
  const colorLabel = (colorName: ThemeColorName) => translate(`theme.color.${colorName}`);
  return (
    <form className="theme-editor" onKeyDown={preventSubmitByImeKey} onSubmit={(event) => {
      event.preventDefault();
      onSave({ id: initialTheme.id, name: name.trim() || translate("theme.newName"), scheme: schemeOfColors(colors), colors });
    }}>
      <div className="field">
        <label htmlFor="theme-name">{translate("theme.nameLabel")}</label>
        <input id="theme-name" value={name} maxLength={CUSTOM_THEME_NAME_MAX_LENGTH} onChange={(event) => setName(event.target.value)} />
      </div>
      <ThemeSample colors={colors} />
      <div className="theme-color-fields">
        {THEME_COLOR_NAMES.map((colorName) => (
          <label key={colorName} className="theme-color-field">
            <input type="color" value={colors[colorName]} onChange={(event) => setColors({ ...colors, [colorName]: event.target.value })} />
            {colorLabel(colorName)}
          </label>
        ))}
      </div>
      {problems.map((problem) => (
        <div key={`${problem.foreground}/${problem.background}`} className="form-error" role="alert">
          {translate("theme.contrastProblem", {
            foreground: colorLabel(problem.foreground),
            background: colorLabel(problem.background),
            ratio: problem.ratio.toFixed(1),
            minimum: problem.minimum,
          })}
        </div>
      ))}
      <div className="form-actions">
        <button type="button" className="secondary-button" onClick={onCancel}>{translate("common.cancel")}</button>
        <button type="submit" className="primary-button" disabled={problems.length > 0}>{translate("common.save")}</button>
      </div>
    </form>
  );
}
