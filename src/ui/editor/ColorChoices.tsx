// 本文の色を選ぶ、色の見本の並び。先頭に「色なし」を置く。

import { Ban, Check } from "lucide-react";
import { translate } from "../i18n/translate";
import { ICON_SIZE } from "../shared/iconSizes";
import { EDITOR_COLOR_NAMES, type EditorColorName, editorTextColorValue, tintedBackground } from "./editorColors";

type ColorChoicesProps = {
  // 見本の色の出し方。背景に使う色は薄めて出し、文字色はそのまま出す。
  appearance: "background" | "text";
  selected: EditorColorName | null;
  onChoose: (colorName: EditorColorName | null) => void;
};

const NO_COLOR_ICON_SIZE = 16;

export function ColorChoices({ appearance, selected, onChoose }: ColorChoicesProps) {
  // 押してもエディタの選択が外れないようにする。
  const keepEditorSelection = (event: React.MouseEvent) => event.preventDefault();
  return (
    <div className="choice-grid color-choices" role="group">
      <button type="button" className={`choice swatch${selected === null ? " on" : ""}`} aria-label={translate("editor.noColor")} aria-pressed={selected === null}
        onMouseDown={keepEditorSelection} onClick={() => onChoose(null)}>
        <Ban size={NO_COLOR_ICON_SIZE} />
      </button>
      {EDITOR_COLOR_NAMES.map((colorName) => (
        <button key={colorName} type="button" className={`choice swatch${selected === colorName ? " on" : ""}`}
          style={appearance === "background"
            ? { background: tintedBackground(colorName), color: "var(--text)" }
            // 文字色は本文の地の上で読める濃さなので、その上のチェックは地の色にすると読める。
            : { background: editorTextColorValue(colorName), color: "var(--panel)" }}
          aria-label={translate(`notebook.color.${colorName}`)} aria-pressed={selected === colorName}
          onMouseDown={keepEditorSelection} onClick={() => onChoose(colorName)}>
          {selected === colorName && <Check size={ICON_SIZE.row} />}
        </button>
      ))}
    </div>
  );
}
