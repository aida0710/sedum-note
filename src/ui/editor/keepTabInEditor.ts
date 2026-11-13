// Tab と Shift+Tab で、カーソルを本文の外（ほかのボタン）へ移さない。
// 箇条書き（項目を深く・浅く）、表（隣のセルへ）、コード（字下げ）が使わなかった Tab は、ここで受けて何もしない。
// 箇条書きの最初の項目のように深くできない所や、ふつうの段落・見出しで Tab を押したときに、フォーカスが外れて
// 続けて打った文字がどこにも入らなくなるのを防ぐ（Google ドキュメントや Notion と同じく、Tab は本文の中で使う）。

import { Extension } from "@tiptap/core";

// ほかの機能の Tab の処理（既定の 100）より後に見る。
const AFTER_OTHER_TAB_HANDLERS = 1;

export const KeepTabInEditor = Extension.create({
  name: "keepTabInEditor",
  priority: AFTER_OTHER_TAB_HANDLERS,
  addKeyboardShortcuts() {
    return { Tab: () => true, "Shift-Tab": () => true };
  },
});
