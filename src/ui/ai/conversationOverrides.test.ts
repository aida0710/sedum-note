import { describe, expect, it } from "vitest";
import { type AiSettings, DEFAULT_AI_SETTINGS } from "../../core/vault/aiSettings";
import { NO_CONVERSATION_OVERRIDES, settingsForConversation } from "./conversationOverrides";

const SETTINGS: AiSettings = {
  ...DEFAULT_AI_SETTINGS,
  enabled: true,
  claude: { apiKey: "key", model: "claude-opus-5-5", models: [] },
};

describe("その会話だけの切り替え", () => {
  it("切り替えていなければ、設定のとおり", () => {
    expect(settingsForConversation(SETTINGS, NO_CONVERSATION_OVERRIDES)).toEqual(SETTINGS);
  });

  it("会話で選んだモデルを使い、設定のモデルは変えない", () => {
    const conversation = settingsForConversation(SETTINGS, { ...NO_CONVERSATION_OVERRIDES, model: { provider: "claude", id: "claude-haiku-5-5" } });
    expect(conversation.claude.model).toBe("claude-haiku-5-5");
    expect(SETTINGS.claude.model).toBe("claude-opus-5-5");
  });

  it("会話で選んだあとに設定のつなぎ先が変わったら、会話のモデルは効かせない", () => {
    const switched: AiSettings = { ...SETTINGS, provider: "openAiCompatible", openAiCompatible: { ...SETTINGS.openAiCompatible, model: "gemma" } };
    const conversation = settingsForConversation(switched, { ...NO_CONVERSATION_OVERRIDES, model: { provider: "claude", id: "claude-haiku-5-5" } });
    expect(conversation.openAiCompatible.model).toBe("gemma");
  });

  it("承認を待たない切り替えは、設定で毎回聞くにしていても、その会話では聞かずに行う", () => {
    const conversation = settingsForConversation(SETTINGS, { ...NO_CONVERSATION_OVERRIDES, editsWithoutAsking: true });
    expect(conversation.permissions.edit).toBe("allow");
    expect(SETTINGS.permissions.edit).toBe("ask");
  });

  it("設定で作る・直すを許可していなければ、会話の切り替えは効かせない", () => {
    const denied: AiSettings = { ...SETTINGS, permissions: { ...SETTINGS.permissions, edit: "deny" } };
    expect(settingsForConversation(denied, { ...NO_CONVERSATION_OVERRIDES, editsWithoutAsking: true }).permissions.edit).toBe("deny");
  });
});
