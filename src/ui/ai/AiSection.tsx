// 設定: アプリ内の AI（つなぎ先、API キー、モデル、AI に任せるメモの操作）。このデバイスだけの設定で、API キーは暗号化して手元に置く。
// API キー（とエンドポイント）は、モデルの一覧を取ってこられたときだけ保存する（取れれば、キーが使えると分かる）。
// モデルは、その一覧から選ぶ。選び直したモデルは、そのことを知らせる。

import { useEffect, useState } from "react";
import { AI_PROVIDERS, type AiProvider, selectedModelOf, withSelectedModel } from "../../core/vault/aiSettings";
import { translate } from "../i18n/translate";
import { preventSubmitByImeKey } from "../shared/imeKeyEvent";
import { useAsyncAction } from "../shared/useAsyncAction";
import { SettingCheckboxRow, SettingRow } from "../settings/SettingRow";
import { type ConnectionDraft, connectionOf, fetchConnectionModels, type VerifiedConnection, withVerifiedConnection } from "./aiConnection";
import { AiModelSelect } from "./AiModelSelect";
import { useAiSettings } from "./aiSettingsAccess";
import { AiToolPermissionSettings } from "./AiToolPermissionSettings";

export function AiSection() {
  const { settings, updateSettings } = useAiSettings();
  const [draft, setDraft] = useState<ConnectionDraft | null>(settings && connectionOf(settings));
  const [verified, setVerified] = useState<VerifiedConnection | null>(null);
  // 保存した設定の読み込みが済んだら、入力欄に入れる。最初の 1 度だけにする（「使う」を保存し終えたときに入れ直すと、
  // その間に打った API キーが消える）。
  const loaded = settings !== null;
  useEffect(() => {
    if (settings) {
      setDraft(connectionOf(settings));
    }
  }, [loaded]);
  // 一覧を取ってくる間に、ほかの欄（使うか、許可、モデル）を変えてもよい。取り終えたら、その時点の設定に入れる。
  const verify = useAsyncAction(async (connection: ConnectionDraft) => {
    setVerified(null);
    const models = await fetchConnectionModels(connection);
    const outcome: { verified?: VerifiedConnection } = {};
    await updateSettings((current) => {
      outcome.verified = withVerifiedConnection(current, connection, models);
      return outcome.verified.settings;
    });
    setVerified(outcome.verified ?? null);
  });
  const save = useAsyncAction(updateSettings);
  if (settings === null || draft === null) {
    return null;
  }
  const change = (changes: Partial<ConnectionDraft>) => {
    setVerified(null);
    setDraft({ ...draft, ...changes });
  };
  const { models: savedModels } = selectedModelOf(settings);
  return (
    <section className="settings-section">
      <h2>{translate("settings.ai")}</h2>
      <p>{translate("ai.description")}</p>
      <p>{translate("ai.privacyWarning")}</p>
      <SettingCheckboxRow controlId="ai-enabled" label={translate("ai.enable")} checked={settings.enabled}
        onChange={(enabled) => void save.run((current) => ({ ...current, enabled }))} />
      {save.errorMessage && <div className="form-error" role="alert">{save.errorMessage}</div>}
      {settings.enabled && (
        <>
          <form className="ai-connection" onKeyDown={preventSubmitByImeKey} onSubmit={(event) => { event.preventDefault(); void verify.run(draft); }}>
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
            {verified && <VerifiedConnectionMessage verified={verified} />}
            <div className="form-actions">
              <button type="submit" className="primary-button" disabled={verify.busy || (draft.provider === "claude" && draft.claudeApiKey === "")}>
                {verify.busy ? translate("ai.verifying") : translate("ai.verifyAndSave")}
              </button>
            </div>
          </form>
          {draft.provider === settings.provider && (savedModels.length > 0
            ? (
              <SettingRow controlId="ai-model" label={translate("ai.model")}>
                {({ id }) => <AiModelSelect id={id} settings={settings} disabled={save.busy} onChoose={(model) => void save.run((current) => withSelectedModel(current, model))} />}
              </SettingRow>
            )
            : <p className="hint">{translate("ai.modelsNotLoaded")}</p>)}
          <AiToolPermissionSettings permissions={settings.permissions}
            onChange={(category, permission) => void save.run((current) => ({ ...current, permissions: { ...current.permissions, [category]: permission } }))} />
        </>
      )}
    </section>
  );
}

// 確かめたあとの知らせ。取ってきたモデルの数と、使うモデル。前に選んでいたモデルが一覧に無くて選び直したときは、そのことも出す。
function VerifiedConnectionMessage({ verified }: { verified: VerifiedConnection }) {
  const { model, models } = selectedModelOf(verified.settings);
  const nameOf = (modelId: string) => models.find((option) => option.id === modelId)?.name ?? modelId;
  const { replacedModel } = verified;
  return (
    <>
      <p className="form-success" role="status">{translate("ai.verified", { count: String(models.length), model: nameOf(model) })}</p>
      {replacedModel && <div className="notice" role="status">{translate("ai.modelReplaced", { previous: replacedModel.previousName, chosen: nameOf(replacedModel.chosenId) })}</div>}
    </>
  );
}
