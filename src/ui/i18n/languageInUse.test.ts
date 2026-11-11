import { describe, expect, it } from "vitest";
import { resolveLanguage } from "./languageInUse";

describe("resolveLanguage", () => {
  it("言語を選んでいれば、システムの言語に関わらずそれを使う", () => {
    expect(resolveLanguage("en", ["ja-JP"])).toBe("en");
  });

  it("システムに合わせるときは、システムの言語の並びで最初に対応しているものを使う", () => {
    expect(resolveLanguage("system", ["fr-FR", "ja-JP", "en-US"])).toBe("ja");
  });

  it("対応している言語が無ければ英語にする", () => {
    expect(resolveLanguage("system", ["fr-FR"])).toBe("en");
    expect(resolveLanguage("system", [])).toBe("en");
  });
});
