// 設定: アプリ内の AI（つなぎ先、API キー、モデル）。このデバイスだけの設定で、API キーは暗号化して手元に置く。
// API キー（とエンドポイント）は、モデルの一覧を取ってこられたときだけ保存する（取れれば、キーが使えると分かる）。
// モデルは、その一覧から選ぶ。

import { useEffect, useState } from "react";
import { AI_PROVIDERS, type AiModelOption, type AiProvider, type AiSettings, DEFAULT_CLAUDE_MODEL } from "../../core/vault/aiSettings";
import { translate } from "../i18n/translate";
import { UserFacingError } from "../i18n/userFacingError";
import { preventSubmitByImeKey } from "../shared/imeKeyEvent";
import { useAsyncAction } from "../shared/useAsyncAction";
import { SettingCheckboxRow, SettingRow } from "../settings/SettingRow";
import { chooseModel, fetchClaudeModels, fetchOpenAiCompatibleModels } from "./aiModelList";
import { AiModelSelect } from "./AiModelSelect";
import { useAiSettings } from "./aiSettingsAccess";

// 確かめてから保存する、つなぎ先の欄（モデルは別に選ぶ）。
type ConnectionDraft = Pick<AiSettings, "provider"> & { claudeApiKey: string; baseUrl: string; openAiApiKey: string };

function connectionOf(settings: AiSettings): ConnectionDraft {
  return { provider: settings.provider, claudeApiKey: settings.claude.apiKey, baseUrl: settings.openAiCompatible.baseUrl, openAiApiKey: settings.openAiCompatible.apiKey };
}

// 選べるモデルが 1 つも無いつなぎ先は、使えないので保存しない。
function requireModels(models: AiModelOption[]): AiModelOption[] {
  if (models.length === 0) {
    throw new UserFacingError(translate("ai.error.noModels"));
  }
  return models;
}

// 入れたつなぎ先からモデルの一覧を取り、取れたら、つなぎ先と一覧と選んだモデルを入れた設定を返す。
async function verifyConnection(settings: AiSettings, draft: ConnectionDraft): Promise<AiSettings> {
  if (draft.provider === "claude") {
    const models = requireModels(await fetchClaudeModels(draft.claudeApiKey));
    const model = chooseModel(models, { previousId: settings.claude.model, preferredId: DEFAULT_CLAUDE_MODEL });
    return { ...settings, provider: "claude", claude: { apiKey: draft.claudeApiKey, model, models } };
  }
  const models = requireModels(await fetchOpenAiCompatibleModels(draft.baseUrl, draft.openAiApiKey));
  const model = chooseModel(models, { previousId: settings.openAiCompatible.model, preferredId: "" });
  return { ...settings, provider: "openAiCompatible", openAiCompatible: { baseUrl: draft.baseUrl, apiKey: draft.openAiApiKey, model, models } };
}

export function AiSection() {
  const { settings, saveSettings } = useAiSettings();
  const [draft, setDraft] = useState<ConnectionDraft | null>(settings && connectionOf(settings));
  const [verifiedModelCount, setVerifiedModelCount] = useState<number | null>(null);
  // 保存した設定の読み込みが済んだら、入力欄に入れる。最初の 1 度だけにする（「使う」を保存し終えたときに入れ直すと、
  // その間に打った API キーが消える）。
  const loaded = settings !== null;
  useEffect(() => {
    if (settings) {
      setDraft(connectionOf(settings));
    }
  }, [loaded]);
  const verify = useAsyncAction(async ({ current, connection }: { current: AiSettings; connection: ConnectionDraft }) => {
    setVerifiedModelCount(null);
    const verified = await verifyConnection(current, connection);
    await saveSettings(verified);
    setVerifiedModelCount((verified.provider === "claude" ? verified.claude : verified.openAiCompatible).models.length);
  });
  const toggle = useAsyncAction(saveSettings);
  if (settings === null || draft === null) {
    return null;
  }
  const change = (changes: Partial<ConnectionDraft>) => {
    setVerifiedModelCount(null);
    setDraft({ ...draft, ...changes });
  };
  const savedModels = settings.provider === "claude" ? settings.claude.models : settings.openAiCompatible.models;
  return (
    <section className="settings-section">
      <h2>{translate("settings.ai")}</h2>
      <p>{translate("ai.description")}</p>
      <p>{translate("ai.privacyWarning")}</p>
      <SettingCheckboxRow controlId="ai-enabled" label={translate("ai.enable")} checked={settings.enabled} onChange={(enabled) => void toggle.run({ ...settings, enabled })} />
      {toggle.errorMessage && <div className="form-error" role="alert">{toggle.errorMessage}</div>}
      {settings.enabled && (
        <>
          <form className="ai-connection" onKeyDown={preventSubmitByImeKey} onSubmit={(event) => { event.preventDefault(); void verify.run({ current: settings, connection: draft }); }}>
            <SettingRow controlId="ai-provider" label={translate("ai.provider")}>
              {(control) => (
                <select {...control} value={draft.provider} onChange={(event) => change({ provider: event.target.value as AiProvider })}>
                  {AI_PROVIDERS.map((provider) => <option key={provider} value={provider}>{translate(`ai.provider.${provider}`)}</option>)}
                </select>
              )}
            </SettingRow>
            {draft.provider === "claude" ? (
              <div className="field">
                <label htmlFor="ai-claude-key">{translate("ai.apiKey")}</label>
                <input id="ai-claude-key" type="password" value={draft.claudeApiKey} autoComplete="off" onChange={(event) => change({ claudeApiKey: event.target.value.trim() })} />
              </div>
            ) : (
              <>
                <div className="field">
                  <label htmlFor="ai-openai-url">{translate("ai.baseUrl")}</label>
                  <input id="ai-openai-url" value={draft.baseUrl} autoComplete="off" spellCheck={false} inputMode="url" onChange={(event) => change({ baseUrl: event.target.value.trim() })} />
                  <span className="hint">{translate("ai.baseUrlHint")}</span>
                </div>
                <div className="field">
                  <label htmlFor="ai-openai-key">{translate("ai.apiKeyOptional")}</label>
                  <input id="ai-openai-key" type="password" value={draft.openAiApiKey} autoComplete="off" onChange={(event) => change({ openAiApiKey: event.target.value.trim() })} />
                </div>
              </>
            )}
            {verify.errorMessage && <div className="form-error" role="alert">{verify.errorMessage}</div>}
            {verifiedModelCount !== null && <p className="form-success" role="status">{translate("ai.verified", { count: String(verifiedModelCount) })}</p>}
            <div className="form-actions">
              <button type="submit" className="primary-button" disabled={verify.busy || (draft.provider === "claude" && draft.claudeApiKey === "")}>
                {verify.busy ? translate("ai.verifying") : translate("ai.verifyAndSave")}
              </button>
            </div>
          </form>
          {draft.provider === settings.provider && (savedModels.length > 0
            ? <SettingRow controlId="ai-model" label={translate("ai.model")}>{({ id }) => <AiModelSelect id={id} />}</SettingRow>
            : <p className="hint">{translate("ai.modelsNotLoaded")}</p>)}
        </>
      )}
    </section>
  );
}
