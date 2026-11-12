import { describe, expect, it } from "vitest";
import { isImeKeyEvent } from "./imeKeyEvent";

describe("変換（IME）の操作として押されたキーの見分け", () => {
  it("変換中のキーを、変換の操作と見る", () => {
    expect(isImeKeyEvent({ isComposing: true, keyCode: 229 })).toBe(true);
    expect(isImeKeyEvent({ isComposing: true, keyCode: 13 })).toBe(true);
  });

  it("変換の終了のあとに届く確定の Enter（WebKit の形）も、変換の操作と見る", () => {
    expect(isImeKeyEvent({ isComposing: false, keyCode: 229 })).toBe(true);
  });

  it("変換していないときの Enter は、変換の操作と見ない", () => {
    expect(isImeKeyEvent({ isComposing: false, keyCode: 13 })).toBe(false);
  });
});
