import { describe, expect, it } from "vitest";
import { countCharacters } from "./NoteCharacterCount";

describe("本文の文字数", () => {
  it("改行と空白を数えない", () => {
    expect(countCharacters("あい う\n　えお\t")).toBe(5);
  });

  it("絵文字や結合した文字は、見た目の 1 文字を 1 と数える", () => {
    expect(countCharacters("👨‍👩‍👧が🇯🇵")).toBe(3);
  });
});
