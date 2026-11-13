import { describe, expect, it } from "vitest";
import { capturedShortcut, matchingShortcut } from "./shortcutMatching";

// 試験は Mac でない機械で流す（Ctrl がショートカットの修飾キー）。keydownHandler が読む項目だけを持つキーの押し下げ。
type PressedKeys = { key: string; code: string; keyCode: number; alt?: boolean; shift?: boolean; ctrl?: boolean };
const press = ({ key, code, keyCode, alt = false, shift = false, ctrl = true }: PressedKeys) =>
  ({ key, code, keyCode, ctrlKey: ctrl, metaKey: false, altKey: alt, shiftKey: shift }) as KeyboardEvent;

describe("ショートカットの照合", () => {
  it("Shift で記号が変わるキーも、記号の変わる前のキーの組み合わせで当たる", () => {
    const event = press({ key: ">", code: "Period", keyCode: 190, shift: true });
    expect(matchingShortcut(event, [{ id: "zoomIn", keys: { key: "." } }, { id: "zoomOut", keys: { key: ".", shift: true } }])).toBe("zoomOut");
  });

  it("Alt で別の文字が出る配列でも、物理的なキーの位置で当たる", () => {
    const event = press({ key: "ñ", code: "KeyN", keyCode: 78, alt: true });
    expect(matchingShortcut(event, [{ id: "newNote", keys: { key: "n", alt: true } }])).toBe("newNote");
  });

  it("修飾キーの組み合わせが違えば当たらない", () => {
    expect(matchingShortcut(press({ key: "n", code: "KeyN", keyCode: 78 }), [{ id: "newNote", keys: { key: "n", alt: true } }])).toBeNull();
  });
});

describe("設定の画面でのキーの記録", () => {
  it("押したキーを、記号の変わる前のキーと修飾キーの組み合わせにする", () => {
    expect(capturedShortcut(press({ key: ">", code: "Period", keyCode: 190, shift: true }))).toEqual({ kind: "keys", keys: { key: ".", shift: true } });
    expect(capturedShortcut(press({ key: "[", code: "BracketLeft", keyCode: 219, alt: true }))).toEqual({ kind: "keys", keys: { key: "[", alt: true } });
    expect(capturedShortcut(press({ key: "M", code: "KeyM", keyCode: 77, alt: true, shift: true }))).toEqual({ kind: "keys", keys: { key: "m", alt: true, shift: true } });
    expect(capturedShortcut(press({ key: "F2", code: "F2", keyCode: 113 }))).toEqual({ kind: "keys", keys: { key: "F2" } });
  });

  it("修飾キーだけのときは続きを待ち、Ctrl の無い組み合わせと、割り当てられないキーは記録しない", () => {
    expect(capturedShortcut(press({ key: "Control", code: "ControlLeft", keyCode: 17 }))).toEqual({ kind: "modifierOnly" });
    expect(capturedShortcut(press({ key: "n", code: "KeyN", keyCode: 78, ctrl: false, alt: true }))).toEqual({ kind: "needsModifier" });
    expect(capturedShortcut(press({ key: " ", code: "Space", keyCode: 32 }))).toEqual({ kind: "unsupported" });
    expect(capturedShortcut(press({ key: "Tab", code: "Tab", keyCode: 9 }))).toEqual({ kind: "unsupported" });
  });
});
