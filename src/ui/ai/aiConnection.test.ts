import { describe, expect, it } from "vitest";
import { type AiModelOption, type AiSettings, DEFAULT_AI_SETTINGS, DEFAULT_CLAUDE_MODEL } from "../../core/vault/aiSettings";
import { connectionOf, withVerifiedConnection } from "./aiConnection";

function modelsOf(...ids: string[]): AiModelOption[] {
  return ids.map((id) => ({ id, name: id, maxOutputTokens: null }));
}

const VERIFIED_CLAUDE: AiSettings = {
  ...DEFAULT_AI_SETTINGS,
  enabled: true,
  claude: { apiKey: "old-key", model: "claude-sonnet-5-5", models: modelsOf("claude-opus-5-5", "claude-sonnet-5-5") },
};

describe("確かめたつなぎ先を設定に入れる", () => {
  it("前に選んでいたモデルが一覧にあれば、そのまま使い、知らせない", () => {
    const connection = { ...connectionOf(VERIFIED_CLAUDE), claudeApiKey: "new-key" };
    const { settings, replacedModel } = withVerifiedConnection(VERIFIED_CLAUDE, connection, modelsOf("claude-opus-5-5", "claude-sonnet-5-5"));
    expect(settings.claude).toEqual({ apiKey: "new-key", model: "claude-sonnet-5-5", models: modelsOf("claude-opus-5-5", "claude-sonnet-5-5") });
    expect(replacedModel).toBeNull();
  });

  it("前に選んでいたモデルが一覧に無ければ、既定のモデルに変え、変えたことを返す", () => {
    const { settings, replacedModel } = withVerifiedConnection(VERIFIED_CLAUDE, connectionOf(VERIFIED_CLAUDE), modelsOf("claude-opus-5-5", "claude-haiku-5-5"));
    expect(settings.claude.model).toBe(DEFAULT_CLAUDE_MODEL);
    expect(replacedModel).toEqual({ previous: "claude-sonnet-5-5", chosen: DEFAULT_CLAUDE_MODEL });
  });

  it("初めて確かめたときは、既定のモデルが一覧に無くても、変えたとは知らせない", () => {
    const first = { ...DEFAULT_AI_SETTINGS, enabled: true };
    const { settings, replacedModel } = withVerifiedConnection(first, { ...connectionOf(first), claudeApiKey: "key" }, modelsOf("claude-haiku-5-5"));
    expect(settings.claude.model).toBe("claude-haiku-5-5");
    expect(replacedModel).toBeNull();
  });

  it("確かめている間に変わった設定（使うか、許可）は、そのまま残す", () => {
    const changedMeanwhile: AiSettings = { ...VERIFIED_CLAUDE, permissions: { ...VERIFIED_CLAUDE.permissions, edit: "allow" } };
    const { settings } = withVerifiedConnection(changedMeanwhile, connectionOf(VERIFIED_CLAUDE), modelsOf("claude-sonnet-5-5"));
    expect(settings.permissions.edit).toBe("allow");
    expect(settings.enabled).toBe(true);
  });

  it("OpenAI 互換のつなぎ先を確かめたら、つなぎ先をそれに切り替え、一覧の先頭のモデルを選ぶ", () => {
    const connection = { ...connectionOf(VERIFIED_CLAUDE), provider: "openAiCompatible" as const, baseUrl: "http://127.0.0.1:11434/v1" };
    const { settings, replacedModel } = withVerifiedConnection(VERIFIED_CLAUDE, connection, modelsOf("gemma", "llama"));
    expect(settings.provider).toBe("openAiCompatible");
    expect(settings.openAiCompatible.model).toBe("gemma");
    expect(settings.claude).toEqual(VERIFIED_CLAUDE.claude);
    expect(replacedModel).toBeNull();
  });
});
