// ショートカットに、いま割り当たっているキー（既定のキーか、このデバイスで変えたキー）と、キーを変える操作。
// キーは一覧の全体で重ならないようにし、エディタや OS が使うキー（shortcutCatalog.ts の RESERVED_SHORTCUT_KEYS）は割り当てない。

import { readDevicePreferences, updateDevicePreferences, useDevicePreferences } from "../preferences/devicePreferences";
import { sameShortcutKeys, type ShortcutKeys, shortcutText } from "../shared/shortcutKeys";
import { RESERVED_SHORTCUT_KEYS, SHORTCUT_DEFINITIONS, shortcutDefinition, type ShortcutId } from "./shortcutCatalog";
import type { ShortcutBinding } from "./shortcutMatching";
import type { ShortcutOverrides } from "./shortcutOverrides";

const currentOverrides = (): ShortcutOverrides => readDevicePreferences().shortcutOverrides;

// いま割り当たっているキー。キーなしにしたものは null。
export function shortcutKeysOf(id: ShortcutId, overrides: ShortcutOverrides = currentOverrides()): ShortcutKeys | null {
  const override = overrides[id];
  return override === undefined ? shortcutDefinition(id).defaultKeys : override;
}

// メニューやパレットに出すキーの表記。キーなしにしたものは null（表記を出さない）。
export function shortcutTextOf(id: ShortcutId, overrides: ShortcutOverrides = currentOverrides()): string | null {
  const keys = shortcutKeysOf(id, overrides);
  return keys === null ? null : shortcutText(keys);
}

// 画面に出すキー。設定でキーを変えると描き直す。
export function useShortcutKeys(id: ShortcutId): ShortcutKeys | null {
  return shortcutKeysOf(id, useDevicePreferences().shortcutOverrides);
}

// 照合に使う、いまのキーの割り当て（キーなしのものは入れない）。
export function shortcutBindings<Id extends ShortcutId>(ids: readonly Id[], overrides: ShortcutOverrides = currentOverrides()): Array<ShortcutBinding<Id>> {
  return ids.flatMap((id) => {
    const keys = shortcutKeysOf(id, overrides);
    return keys === null ? [] : [{ id, keys }];
  });
}

// 既定のキーから変えたか。
export function isShortcutChanged(id: ShortcutId, overrides: ShortcutOverrides): boolean {
  return overrides[id] !== undefined;
}

// キーを割り当てられない理由。reserved は、エディタや OS が使うキー。inUse は、ほかのショートカットが使っているキー。
export type ShortcutKeysProblem = { kind: "reserved" } | { kind: "inUse"; shortcutId: ShortcutId };

export function problemWithShortcutKeys(id: ShortcutId, keys: ShortcutKeys, overrides: ShortcutOverrides): ShortcutKeysProblem | null {
  const isDefault = sameShortcutKeys(keys, shortcutDefinition(id).defaultKeys);
  if (!isDefault && RESERVED_SHORTCUT_KEYS.some((reserved) => sameShortcutKeys(reserved, keys))) {
    return { kind: "reserved" };
  }
  const user = SHORTCUT_DEFINITIONS.find((definition) => {
    const assigned = definition.id === id ? null : shortcutKeysOf(definition.id, overrides);
    return assigned !== null && sameShortcutKeys(assigned, keys);
  });
  return user ? { kind: "inUse", shortcutId: user.id } : null;
}

// キーを割り当てる（null はキーなし）。割り当てられなければ、変えずに理由を返す。既定のキーに戻したら、変えた記録を消す。
export function assignShortcutKeys(id: ShortcutId, keys: ShortcutKeys | null): ShortcutKeysProblem | null {
  const overrides = currentOverrides();
  const problem = keys === null ? null : problemWithShortcutKeys(id, keys, overrides);
  if (problem) {
    return problem;
  }
  const next: ShortcutOverrides = { ...overrides };
  if (keys !== null && sameShortcutKeys(keys, shortcutDefinition(id).defaultKeys)) {
    delete next[id];
  } else {
    next[id] = keys;
  }
  updateDevicePreferences({ shortcutOverrides: next });
  return null;
}

// 既定のキーに戻す。そのキーをほかのショートカットに割り当てていれば、戻さずに理由を返す。
export function resetShortcutKeys(id: ShortcutId): ShortcutKeysProblem | null {
  return assignShortcutKeys(id, shortcutDefinition(id).defaultKeys);
}

export function resetAllShortcutKeys(): void {
  updateDevicePreferences({ shortcutOverrides: {} });
}
