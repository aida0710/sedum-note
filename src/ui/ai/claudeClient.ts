// Claude の API の客（公式の SDK）を作り、SDK の失敗を、利用者に見せる言葉に直す。
// SDK は大きいので、最初に使うときにだけ読み込む。

import type Anthropic from "@anthropic-ai/sdk";
import { translate } from "../i18n/translate";
import { UserFacingError } from "../i18n/userFacingError";

type AnthropicModule = typeof Anthropic;

export type ClaudeClient = { client: Anthropic; sdk: AnthropicModule };

export async function createClaudeClient(apiKey: string): Promise<ClaudeClient> {
  const { default: sdk } = await import("@anthropic-ai/sdk");
  // このアプリは利用者の手元で動き、API キーは利用者自身のもの（暗号化して手元に置いている）なので、画面から直接呼ぶ。
  return { client: new sdk({ apiKey, dangerouslyAllowBrowser: true }), sdk };
}

// SDK の失敗を、利用者に見せる失敗に直す。直せないもの（プログラムの誤りなど）は、そのまま返す。
// model は、見つからなかったときに名前を出すため。
export function userFacingClaudeError(sdk: AnthropicModule, error: unknown, model?: string): unknown {
  if (error instanceof sdk.AuthenticationError || error instanceof sdk.PermissionDeniedError) {
    return new UserFacingError(translate("ai.error.authentication"));
  }
  if (error instanceof sdk.NotFoundError && model !== undefined) {
    return new UserFacingError(translate("ai.error.modelNotFound", { model }));
  }
  if (error instanceof sdk.RateLimitError) {
    return new UserFacingError(translate("ai.error.rateLimited"));
  }
  if (error instanceof sdk.APIConnectionError) {
    return new UserFacingError(translate("ai.error.connection"));
  }
  if (error instanceof sdk.APIError) {
    return new UserFacingError(translate("ai.error.api", { status: String(error.status ?? ""), reason: error.message }));
  }
  return error;
}
