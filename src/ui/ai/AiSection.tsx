// 設定: アプリ内の AI（つなぎ先、API キー、モデル）。このデバイスだけの設定で、API キーは暗号化して手元に置く。

import { useEffect, useState } from "react";
import { AI_PROVIDERS, type AiProvider, type AiSettings } from "../../core/vault/aiSettings";
import { translate } from "../i18n/translate";
import { preventSubmitByImeKey } from "../shared/imeKeyEvent";
import { useAsyncAction } from "../shared/useAsyncAction";
import { useAiSettings } from "./aiSettingsAccess";

export function AiSection() {
  const { settings, saveSettings } = useAiSettings();
  const [draft, setDraft] = useState<AiSettings | null>(settings);
  // 保存した設定の読み込みが済んだら、入力欄に入れる。
  useEffect(() => setDraft(settings), [settings]);
  const save = useAsyncAction(saveSettings);
  if (draft === null) {
    return null;
  }
  const change = (changes: Partial<AiSettings>) => setDraft({ ...draft, ...changes });
  const unchanged = JSON.stringify(draft) === JSON.stringify(settings);
  return (
    <form className="settings-section" onKeyDown={preventSubmitByImeKey} onSubmit={(event) => { event.preventDefault(); void save.run(draft); }}>
      <h2>{translate("settings.ai")}</h2>
      <p>{translate("ai.description")}</p>
      <p>{translate("ai.privacyWarning")}</p>
      <label className="checkbox-line">
        <input type="checkbox" checked={draft.enabled} onChange={(event) => change({ enabled: event.target.checked })} />
        {translate("ai.enable")}
      </label>
      {draft.enabled && (
        <>
          <div className="field">
            <label htmlFor="ai-provider">{translate("ai.provider")}</label>
            <select id="ai-provider" value={draft.provider} onChange={(event) => change({ provider: event.target.value as AiProvider })}>
              {AI_PROVIDERS.map((provider) => <option key={provider} value={provider}>{translate(`ai.provider.${provider}`)}</option>)}
            </select>
          </div>
          {draft.provider === "claude" ? (
            <div className="field-grid">
              <div className="field">
                <label htmlFor="ai-claude-key">{translate("ai.apiKey")}</label>
                <input id="ai-claude-key" type="password" value={draft.claude.apiKey} autoComplete="off" onChange={(event) => change({ claude: { ...draft.claude, apiKey: event.target.value } })} />
              </div>
              <div className="field">
                <label htmlFor="ai-claude-model">{translate("ai.model")}</label>
                <input id="ai-claude-model" value={draft.claude.model} autoComplete="off" spellCheck={false} onChange={(event) => change({ claude: { ...draft.claude, model: event.target.value.trim() } })} />
              </div>
            </div>
          ) : (
            <>
              <div className="field">
                <label htmlFor="ai-openai-url">{translate("ai.baseUrl")}</label>
                <input id="ai-openai-url" value={draft.openAiCompatible.baseUrl} autoComplete="off" spellCheck={false} inputMode="url"
                  onChange={(event) => change({ openAiCompatible: { ...draft.openAiCompatible, baseUrl: event.target.value.trim() } })} />
                <span className="hint">{translate("ai.baseUrlHint")}</span>
              </div>
              <div className="field-grid">
                <div className="field">
                  <label htmlFor="ai-openai-key">{translate("ai.apiKeyOptional")}</label>
                  <input id="ai-openai-key" type="password" value={draft.openAiCompatible.apiKey} autoComplete="off"
                    onChange={(event) => change({ openAiCompatible: { ...draft.openAiCompatible, apiKey: event.target.value } })} />
                </div>
                <div className="field">
                  <label htmlFor="ai-openai-model">{translate("ai.model")}</label>
                  <input id="ai-openai-model" value={draft.openAiCompatible.model} autoComplete="off" spellCheck={false}
                    onChange={(event) => change({ openAiCompatible: { ...draft.openAiCompatible, model: event.target.value.trim() } })} />
                </div>
              </div>
            </>
          )}
        </>
      )}
      {save.errorMessage && <div className="form-error" role="alert">{save.errorMessage}</div>}
      <div className="form-actions">
        <button type="submit" className="primary-button" disabled={unchanged || save.busy}>{translate("ai.save")}</button>
      </div>
    </form>
  );
}
