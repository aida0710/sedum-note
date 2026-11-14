// 設定の「表示」の、本文の文字の組み方（大きさ・字の間・行の間）。つまみ（スライダー）で選び、すぐ下の見本の文で
// 見え方を確かめられる。見本は本文と同じ CSS の変数で描くので、本文の見え方と同じになる。
// 動かしすぎて元が分からなくならないよう、つまみごとにデフォルトへ戻すボタンを置く。デフォルトのときも消さずに
// 押せなくするだけにして、つまみの位置がずれないようにする。

import { RotateCcw } from "lucide-react";
import { translate } from "../i18n/translate";
import { updateDevicePreferences, useDevicePreferences } from "../preferences/devicePreferences";
import { DEFAULT_EDITOR_TYPOGRAPHY, EDITOR_TYPOGRAPHY_RANGES, type EditorTypography } from "../preferences/editorTypography";
import { SettingRow } from "./SettingRow";

// つまみの横に出す、今の値の書き方。
const VALUE_TEXT: Record<keyof EditorTypography, (value: number) => string> = {
  fontSize: (value) => `${value}px`,
  letterSpacing: (value) => `${value.toFixed(2)}em`,
  lineHeight: (value) => value.toFixed(2),
};

const LABELS = { fontSize: "settings.editorFontSize", letterSpacing: "settings.editorLetterSpacing", lineHeight: "settings.editorLineHeight" } as const;

export function EditorTypographySettings() {
  const { editorTypography } = useDevicePreferences();
  const change = (name: keyof EditorTypography, value: number) => updateDevicePreferences({ editorTypography: { ...editorTypography, [name]: value } });
  const isDefault = (Object.keys(DEFAULT_EDITOR_TYPOGRAPHY) as Array<keyof EditorTypography>).every((name) => editorTypography[name] === DEFAULT_EDITOR_TYPOGRAPHY[name]);
  return (
    <>
      {(Object.keys(LABELS) as Array<keyof EditorTypography>).map((name) => {
        const { minimum, maximum, step } = EDITOR_TYPOGRAPHY_RANGES[name];
        return (
          <SettingRow key={name} controlId={`display-editor-${name}`} label={translate(LABELS[name])}>
            {(control) => (
              <span className="setting-slider">
                <input type="range" {...control} min={minimum} max={maximum} step={step} value={editorTypography[name]}
                  onChange={(event) => change(name, Number(event.target.value))} />
                <output htmlFor={control.id}>{VALUE_TEXT[name](editorTypography[name])}</output>
                <ResetToDefaultButton name={name} isDefault={editorTypography[name] === DEFAULT_EDITOR_TYPOGRAPHY[name]} onReset={() => change(name, DEFAULT_EDITOR_TYPOGRAPHY[name])} />
              </span>
            )}
          </SettingRow>
        );
      })}
      <div className="typography-preview" aria-label={translate("settings.editorTypographyPreview")}>
        <p>{translate("settings.editorTypographySample")}</p>
        <button type="button" className="secondary-button" disabled={isDefault} onClick={() => updateDevicePreferences({ editorTypography: DEFAULT_EDITOR_TYPOGRAPHY })}>
          {translate("settings.editorTypographyReset")}
        </button>
      </div>
    </>
  );
}

// 1 つのつまみをデフォルトの値に戻すボタン。名前にデフォルトの値を入れ、押す前に戻る先が分かるようにする。
function ResetToDefaultButton({ name, isDefault, onReset }: { name: keyof EditorTypography; isDefault: boolean; onReset: () => void }) {
  const label = translate("settings.editorTypographyResetOne", { name: translate(LABELS[name]), value: VALUE_TEXT[name](DEFAULT_EDITOR_TYPOGRAPHY[name]) });
  return (
    <button type="button" className="icon-button" aria-label={label} title={label} disabled={isDefault} onClick={onReset}>
      <RotateCcw size={16} aria-hidden="true" />
    </button>
  );
}
