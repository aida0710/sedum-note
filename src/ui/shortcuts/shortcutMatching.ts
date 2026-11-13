// キーの押し下げが、どのショートカットに当たるか。本文の中のキーを受けるエディタ（prosemirror-keymap の keydownHandler）と
// 同じ決まりで照合する。画面全体のキーも、設定の画面でキーを記録するときの確かめも、ここを通す（記録できたのに効かない、
// を作らないため）。Shift で記号が変わるキーや、Mac の Option で別の文字が出るキーも、keydownHandler が物理的なキーで当てる。
// Windows の Ctrl+Alt は AltGr のことがあるので keydownHandler は物理的なキーで当てない。そこで、物理的なキーの位置
// （KeyboardEvent.code）の名前でも当てる（今までの画面全体のキーの当て方と同じ）。

import { keydownHandler } from "@tiptap/pm/keymap";
import type { EditorView } from "@tiptap/pm/view";
import { editorKeymapName, isApplePlatform, type ShortcutKeys } from "../shared/shortcutKeys";

export type ShortcutBinding<Id extends string> = { id: Id; keys: ShortcutKeys };

// keydownHandler は、当たったコマンドに view の state と dispatch を渡す。ここでは当たったことだけを知りたいので、
// コマンドはそれを読まない。
const VIEW_FOR_MATCHING = { state: null, dispatch: () => undefined } as unknown as EditorView;

// 物理的なキーの位置（US 配列）の名前。文字のキーと数字のキーは、規則で決める。
const CODE_KEY_NAMES: Record<string, string> = {
  Period: ".", Comma: ",", Slash: "/", Semicolon: ";", Quote: "'", BracketLeft: "[", BracketRight: "]", Backslash: "\\", Minus: "-", Equal: "=", Backquote: "`",
};

function keyNameOfCode(code: string): string | null {
  if (/^Key[A-Z]$/.test(code)) {
    return code.slice(3).toLowerCase();
  }
  if (/^Digit[0-9]$/.test(code)) {
    return code.slice(5);
  }
  return CODE_KEY_NAMES[code] ?? null;
}

// Ctrl（Mac は Command）を押していて、もう一方（Mac は Ctrl、ほかは Windows キーなど）は押していないか。
function hasCommandModifier(event: KeyboardEvent): boolean {
  return isApplePlatform() ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
}

function matchesByCode(event: KeyboardEvent, keys: ShortcutKeys): boolean {
  return hasCommandModifier(event) && keyNameOfCode(event.code) === keys.key.toLowerCase() && event.altKey === Boolean(keys.alt) && event.shiftKey === Boolean(keys.shift);
}

export function matchingShortcut<Id extends string>(event: KeyboardEvent, bindings: ReadonlyArray<ShortcutBinding<Id>>): Id | null {
  let matched: Id | null = null;
  const handler = keydownHandler(Object.fromEntries(bindings.map(({ id, keys }) => [editorKeymapName(keys), () => {
    matched = id;
    return true;
  }])));
  handler(VIEW_FOR_MATCHING, event);
  return matched ?? bindings.find((binding) => matchesByCode(event, binding.keys))?.id ?? null;
}

// 設定の画面で押されたキーを、記録するキーの組み合わせにした結果。
//   keys: 記録できる。modifierOnly: Ctrl などだけが押された（続けて押すキーを待つ）。
//   needsModifier: Ctrl（Mac は Command）を押していない。unsupported: 割り当てられないキー（Space・Tab・Esc など）。
export type CapturedShortcut = { kind: "keys"; keys: ShortcutKeys } | { kind: "modifierOnly" } | { kind: "needsModifier" } | { kind: "unsupported" };

const MODIFIER_KEY_NAMES = new Set(["Control", "Meta", "Alt", "AltGraph", "Shift", "CapsLock", "Fn", "OS"]);
const NAMED_KEYS = new Set(["Enter", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", ...Array.from({ length: 12 }, (_, index) => `F${index + 1}`)]);

function isAssignableKeyName(name: string): boolean {
  return (name.length === 1 && name !== " ") || NAMED_KEYS.has(name);
}

export function capturedShortcut(event: KeyboardEvent): CapturedShortcut {
  if (MODIFIER_KEY_NAMES.has(event.key)) {
    return { kind: "modifierOnly" };
  }
  if (!hasCommandModifier(event)) {
    return { kind: "needsModifier" };
  }
  const typed = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  const physical = keyNameOfCode(event.code);
  // Shift や Option を押していると出る文字が変わる（Shift+. は >）ので、そのときは物理的なキーの名前を先に試す。
  const candidates = event.shiftKey || event.altKey ? [physical, typed] : [typed, physical];
  for (const key of candidates) {
    if (key === null || !isAssignableKeyName(key)) {
      continue;
    }
    const keys: ShortcutKeys = { key, ...(event.altKey ? { alt: true } : {}), ...(event.shiftKey ? { shift: true } : {}) };
    // 記録しようとするキーで、いま押されたキーが本当に当たるときだけ記録する。
    if (matchingShortcut(event, [{ id: "captured", keys }]) === "captured") {
      return { kind: "keys", keys };
    }
  }
  return { kind: "unsupported" };
}
