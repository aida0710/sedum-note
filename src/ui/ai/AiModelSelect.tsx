// 使うモデルを、つなぎ先から取ってきた一覧から選ぶ欄。選んだモデルをどうするか（設定に保存する、その会話だけで使う）は、
// 置く側が決める（設定の画面と、AI チャットの上）。

import { type AiModelOption, type AiSettings, selectedModelOf } from "../../core/vault/aiSettings";

type AiModelSelectProps = {
  id: string;
  // 今のモデルと一覧を読む設定（AI チャットでは、その会話で使う設定）。
  settings: AiSettings;
  onChoose: (modelId: string) => void;
  disabled?: boolean;
  // 読み上げ用の名前。無ければ、名前は呼び出し側の label が付ける（設定の画面の SettingRow）。
  ariaLabel?: string;
  // true なら、チャットの上の狭い所に置く形にする。
  compact?: boolean;
};

export function AiModelSelect({ id, settings, onChoose, disabled = false, ariaLabel, compact = false }: AiModelSelectProps) {
  const { model, models } = selectedModelOf(settings);
  // 前の版で手で入れたモデルが一覧に無くても、選んでいるものとして見せる（黙って別のモデルに変えない）。
  const options: AiModelOption[] = model === "" || models.some((option) => option.id === model) ? models : [{ id: model, name: model, maxOutputTokens: null }, ...models];
  return (
    <select id={id} className={compact ? "ai-model-select" : undefined} aria-label={ariaLabel}
      value={model} disabled={disabled || options.length === 0} onChange={(event) => onChoose(event.target.value)}>
      {options.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
    </select>
  );
}
