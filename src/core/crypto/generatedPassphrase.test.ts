import { describe, expect, it } from "vitest";
import { newGeneratedPassphrase } from "./generatedPassphrase";
import { MIN_PASSPHRASE_LENGTH } from "./passphraseKey";

describe("newGeneratedPassphrase", () => {
  it("読み違えない文字だけの、4 文字ずつ区切った 29 文字を作る", () => {
    const passphrase = newGeneratedPassphrase();
    expect(passphrase).toMatch(/^([0-9A-HJKMNP-TV-Z]{4}-){5}[0-9A-HJKMNP-TV-Z]{4}$/);
    expect(passphrase.length).toBeGreaterThanOrEqual(MIN_PASSPHRASE_LENGTH);
  });

  it("呼ぶたびに違うものを作る", () => {
    expect(new Set(Array.from({ length: 50 }, newGeneratedPassphrase)).size).toBe(50);
  });
});
