// 本文の中で効くショートカットのうち、設定で変えられるもの（shortcuts/shortcutCatalog.ts の body と table）を受ける
// ProseMirror のプラグイン。キーは押されたときに、このデバイスの設定から読む（設定でキーを変えると、開いているメモにもすぐ効く）。
// 照合は、画面全体のショートカットと同じ（shortcuts/shortcutMatching.ts）。
// 拡張の addProseMirrorPlugins から返すので、受ける順は、その拡張の addKeyboardShortcuts と同じ（拡張の priority で決まる）。

import { Plugin } from "@tiptap/pm/state";
import { shortcutBindings } from "../shortcuts/shortcutBindings";
import type { ShortcutId } from "../shortcuts/shortcutCatalog";
import { matchingShortcut } from "../shortcuts/shortcutMatching";

// ショートカットごとの操作。行ったら true、ここでは何もしない（ほかのキーの扱いに任せる）なら false。
export type EditorShortcutRuns = Partial<Record<ShortcutId, () => boolean>>;

export function editorShortcutPlugin(runs: EditorShortcutRuns): Plugin {
  const ids = Object.keys(runs) as ShortcutId[];
  return new Plugin({
    props: {
      handleKeyDown: (_view, event) => {
        const shortcutId = matchingShortcut(event, shortcutBindings(ids));
        return shortcutId !== null && (runs[shortcutId]?.() ?? false);
      },
    },
  });
}
