// つなぎ先から、使えるモデルの一覧を取ってくる。取れたら、API キー（とエンドポイント）が使えると分かる。
// 取れなければ、利用者に見せる失敗（UserFacingError）を投げる。

import type { AiModelOption } from "../../core/vault/aiSettings";
import { translate } from "../i18n/translate";
import { UserFacingError } from "../i18n/userFacingError";
import { createClaudeClient, userFacingClaudeError } from "./claudeClient";

export async function fetchClaudeModels(apiKey: string): Promise<AiModelOption[]> {
  const { client, sdk } = await createClaudeClient(apiKey);
  try {
    const models: AiModelOption[] = [];
    // 一覧は新しいモデルから順に届く。ページ送りは SDK が行う。
    for await (const model of client.models.list()) {
      models.push({ id: model.id, name: model.display_name || model.id, maxOutputTokens: model.max_tokens ?? null });
    }
    return models;
  } catch (error) {
    throw userFacingClaudeError(sdk, error);
  }
}

type OpenAiModelList = { data?: Array<{ id?: unknown }> };

// OpenAI 互換のエンドポイントの GET /models（OpenAI、Ollama、llama.cpp の server などが持つ）。
export async function fetchOpenAiCompatibleModels(baseUrl: string, apiKey: string): Promise<AiModelOption[]> {
  let response: Response;
  try {
    response = await fetch(`${baseUrl.replace(/\/+$/, "")}/models`, {
      headers: apiKey === "" ? {} : { Authorization: `Bearer ${apiKey}` },
    });
  } catch {
    throw new UserFacingError(translate("ai.error.connection"));
  }
  if (response.status === 401 || response.status === 403) {
    throw new UserFacingError(translate("ai.error.authentication"));
  }
  if (!response.ok) {
    throw new UserFacingError(translate("ai.error.api", { status: String(response.status), reason: (await response.text()).slice(0, 300) }));
  }
  const list = (await response.json().catch(() => ({}))) as OpenAiModelList;
  const ids = (list.data ?? []).map((entry) => entry.id).filter((id): id is string => typeof id === "string" && id !== "");
  return [...new Set(ids)].sort().map((id) => ({ id, name: id, maxOutputTokens: null }));
}

// 一覧が変わったあとに選んでおくモデル。前に選んでいたものが一覧にあればそのまま、無ければ preferredId、それも無ければ先頭。
export function chooseModel(models: AiModelOption[], input: { previousId: string; preferredId: string }): string {
  const ids = models.map((model) => model.id);
  if (ids.includes(input.previousId)) {
    return input.previousId;
  }
  if (ids.includes(input.preferredId)) {
    return input.preferredId;
  }
  return ids[0] ?? "";
}
