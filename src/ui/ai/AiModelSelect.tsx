// 使うモデルを、つなぎ先から取ってきた一覧から選ぶ。選ぶとすぐ保存する（設定の画面と、AI チャットの両方に置く）。

import type { AiModelOption, AiSettings } from "../../core/vault/aiSettings";
import { translate } from "../i18n/translate";
import { useAsyncAction } from "../shared/useAsyncAction";
import { useAiSettings } from "./aiSettingsAccess";

type AiModelSelectProps = {
  id: string;
  // true なら、チャットの上の狭い所に置く形にして、読み上げ用の名前を付ける。
  // false なら、名前は呼び出し側の label が付ける（設定の画面の SettingRow）。
  compact?: boolean;
};

function withModel(settings: AiSettings, model: string): AiSettings {
  return settings.provider === "claude"
    ? { ...settings, claude: { ...settings.claude, model } }
    : { ...settings, openAiCompatible: { ...settings.openAiCompatible, model } };
}

export function AiModelSelect({ id, compact = false }: AiModelSelectProps) {
  const { settings, saveSettings } = useAiSettings();
  const save = useAsyncAction(saveSettings);
  if (!settings) {
    return null;
  }
  const { model, models } = settings.provider === "claude" ? settings.claude : settings.openAiCompatible;
  // 前の版で手で入れたモデルが一覧に無くても、選んでいるものとして見せる（黙って別のモデルに変えない）。
  const options: AiModelOption[] = model === "" || models.some((option) => option.id === model) ? models : [{ id: model, name: model, maxOutputTokens: null }, ...models];
  return (
    <>
      <select id={id} className={compact ? "ai-model-select" : undefined} aria-label={compact ? translate("ai.model") : undefined}
        value={model} disabled={save.busy || options.length === 0} onChange={(event) => void save.run(withModel(settings, event.target.value))}>
        {options.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
      </select>
      {save.errorMessage && <div className="form-error" role="alert">{save.errorMessage}</div>}
    </>
  );
}
