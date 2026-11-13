// 利用者が変えたショートカットのキー（このデバイスだけの設定。devicePreferences の shortcutOverrides）。
// 変えていないショートカットは入れず、既定のキー（shortcutCatalog.ts）を使う。null は「キーなし」。

import type { ShortcutKeys } from "../shared/shortcutKeys";
import { isShortcutId, type ShortcutId } from "./shortcutCatalog";

export type ShortcutOverrides = Partial<Record<ShortcutId, ShortcutKeys | null>>;

function settledKeys(stored: unknown): ShortcutKeys | null | undefined {
  if (stored === null) {
    return null;
  }
  if (typeof stored !== "object") {
    return undefined;
  }
  const { key, alt, shift } = stored as Record<string, unknown>;
  if (typeof key !== "string" || key === "" || (alt !== undefined && typeof alt !== "boolean") || (shift !== undefined && typeof shift !== "boolean")) {
    return undefined;
  }
  return { key, ...(alt ? { alt: true } : {}), ...(shift ? { shift: true } : {}) };
}

// 保存した値を読む。知らない ID（前の版にあったショートカットなど）と、読めないキーは捨てる。
export function settledShortcutOverrides(stored: unknown): ShortcutOverrides {
  if (typeof stored !== "object" || stored === null) {
    return {};
  }
  const overrides: ShortcutOverrides = {};
  for (const [id, value] of Object.entries(stored)) {
    const keys = settledKeys(value);
    if (isShortcutId(id) && keys !== undefined) {
      overrides[id] = keys;
    }
  }
  return overrides;
}
