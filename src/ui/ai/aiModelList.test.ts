import { describe, expect, it } from "vitest";
import { chooseModel } from "./aiModelList";

const models = [
  { id: "claude-sonnet-5-5", name: "Claude Sonnet 5.5", maxOutputTokens: 128000 },
  { id: "claude-opus-5-5", name: "Claude Opus 5.5", maxOutputTokens: 128000 },
];

describe("一覧を取り直したあとに選ぶモデル", () => {
  it("前に選んでいたモデルが一覧にあれば、そのまま選ぶ", () => {
    expect(chooseModel(models, { previousId: "claude-sonnet-5-5", preferredId: "claude-opus-5-5" })).toBe("claude-sonnet-5-5");
  });

  it("前のモデルが一覧に無ければ既定のモデル、それも無ければ一覧の先頭を選ぶ", () => {
    expect(chooseModel(models, { previousId: "手で入れた名前", preferredId: "claude-opus-5-5" })).toBe("claude-opus-5-5");
    expect(chooseModel(models, { previousId: "", preferredId: "" })).toBe("claude-sonnet-5-5");
    expect(chooseModel([], { previousId: "", preferredId: "claude-opus-5-5" })).toBe("");
  });
});
