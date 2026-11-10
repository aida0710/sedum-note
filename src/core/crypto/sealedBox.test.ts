import { describe, expect, it } from "vitest";
import { importAesKey, open, seal, SealedBoxError } from "./sealedBox";

async function newKey(): Promise<CryptoKey> {
  return importAesKey(crypto.getRandomValues(new Uint8Array(32)), false);
}

describe("sealedBox", () => {
  it("同じキーと binding なら封じた内容をそのまま開ける", async () => {
    const key = await newKey();
    const plaintext = new TextEncoder().encode("買い物リスト");
    expect(await open(key, await seal(key, plaintext, "record:a"), "record:a")).toEqual(plaintext);
  });

  it("別の記録の binding では開けない（暗号文の入れ替えを見抜く）", async () => {
    const key = await newKey();
    const sealed = await seal(key, new Uint8Array([1, 2, 3]), "record:a");
    await expect(open(key, sealed, "record:b")).rejects.toBeInstanceOf(SealedBoxError);
  });

  it("1 バイトでも書き換えられた暗号文は開けない", async () => {
    const key = await newKey();
    const sealed = await seal(key, new Uint8Array([1, 2, 3]), "record:a");
    sealed[sealed.length - 1] = (sealed[sealed.length - 1] ?? 0) ^ 1;
    await expect(open(key, sealed, "record:a")).rejects.toBeInstanceOf(SealedBoxError);
  });

  it("同じ内容を封じても毎回違う暗号文になる", async () => {
    const key = await newKey();
    const plaintext = new Uint8Array([7]);
    expect(await seal(key, plaintext, "x")).not.toEqual(await seal(key, plaintext, "x"));
  });
});
