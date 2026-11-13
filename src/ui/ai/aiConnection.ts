// 設定の「AI」のページのつなぎ先（種類、API キー、エンドポイント）を、確かめてから設定に入れる。
// 確かめるとは、入れたつなぎ先からモデルの一覧を取ってくること（取れれば、キーが使えると分かる）。

import { type AiModelOption, type AiProvider, type AiSettings, DEFAULT_AI_SETTINGS, DEFAULT_CLAUDE_MODEL } from "../../core/vault/aiSettings";
import { translate } from "../i18n/translate";
import { UserFacingError } from "../i18n/userFacingError";
import { chooseModel, fetchClaudeModels, fetchOpenAiCompatibleModels } from "./aiModelList";

// 入力中のつなぎ先。確かめるまでは設定に入れない（モデルは別に選ぶ）。
export type ConnectionDraft = Pick<AiSettings, "provider"> & { claudeApiKey: string; baseUrl: string; openAiApiKey: string };

// 前に選んでいたモデルが新しい一覧に無く、別のモデルに変えたときの、前のモデルの名前（前の一覧での名前）と、選び直したモデル。
export type ReplacedModel = { previousName: string; chosenId: string };

export type VerifiedConnection = { settings: AiSettings; replacedModel: ReplacedModel | null };

// まだ選んだことがないときのモデル（設定の既定）。これを持っていても、利用者が選んだモデルとは見なさない。
const UNCHOSEN_MODELS: Record<AiProvider, string> = { claude: DEFAULT_CLAUDE_MODEL, openAiCompatible: DEFAULT_AI_SETTINGS.openAiCompatible.model };

export function connectionOf(settings: AiSettings): ConnectionDraft {
  return { provider: settings.provider, claudeApiKey: settings.claude.apiKey, baseUrl: settings.openAiCompatible.baseUrl, openAiApiKey: settings.openAiCompatible.apiKey };
}

// 入れたつなぎ先から、選べるモデルの一覧を取ってくる。1 つも無ければ、使えないので失敗にする。
export async function fetchConnectionModels(connection: ConnectionDraft): Promise<AiModelOption[]> {
  const models = connection.provider === "claude"
    ? await fetchClaudeModels(connection.claudeApiKey)
    : await fetchOpenAiCompatibleModels(connection.baseUrl, connection.openAiApiKey);
  if (models.length === 0) {
    throw new UserFacingError(translate("ai.error.noModels"));
  }
  return models;
}

// 確かめたつなぎ先と、取ってきた一覧を、今の設定に入れる。モデルは一覧から選び直す（前に選んでいたものが一覧にあればそのまま）。
export function withVerifiedConnection(current: AiSettings, connection: ConnectionDraft, models: AiModelOption[]): VerifiedConnection {
  const previous = connection.provider === "claude" ? current.claude : current.openAiCompatible;
  const preferredId = connection.provider === "claude" ? DEFAULT_CLAUDE_MODEL : "";
  const model = chooseModel(models, { previousId: previous.model, preferredId });
  const hadChosenModel = previous.models.length > 0 || previous.model !== UNCHOSEN_MODELS[connection.provider];
  const previousName = previous.models.find((option) => option.id === previous.model)?.name ?? previous.model;
  const replacedModel = hadChosenModel && model !== previous.model ? { previousName, chosenId: model } : null;
  const settings: AiSettings = connection.provider === "claude"
    ? { ...current, provider: "claude", claude: { apiKey: connection.claudeApiKey, model, models } }
    : { ...current, provider: "openAiCompatible", openAiCompatible: { baseUrl: connection.baseUrl, apiKey: connection.openAiApiKey, model, models } };
  return { settings, replacedModel };
}
