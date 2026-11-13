// Ctrl+Shift+V（⌘+Shift+V）の「書式なしで貼り付け」。貼った文字を、そのままの文字で入れる。
// エディタの既定では、Shift を押していても、URL はリンクに、Markdown の記号は書式（見出し・太字など）に変わっていた。
// 行は今の行の続きと段落に分け（書式のない文字の貼り付けと同じ。pastedPlainText.ts）、コードの中なら改行のまま入れる。

import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { plainTextSlice } from "./pastedPlainText";
import { PASTED_CONTENT_META } from "./pasteUndoStep";

function isPlainPasteKey(event: KeyboardEvent): boolean {
  return (event.ctrlKey || event.metaKey) && event.shiftKey && !event.altKey && (event.code === "KeyV" || event.key.toLowerCase() === "v");
}

export const PlainTextPaste = Extension.create({
  name: "plainTextPaste",

  addProseMirrorPlugins() {
    // 直前に押したキーが「書式なしで貼り付け」か。ブラウザは、そのキーのすぐあとに paste を送る。
    let plainPasteRequested = false;
    return [new Plugin({
      key: new PluginKey("plainTextPaste"),
      props: {
        handleKeyDown: (_view, event) => {
          plainPasteRequested = isPlainPasteKey(event);
          return false;
        },
        handleDOMEvents: {
          paste: (view, event) => {
            const requested = plainPasteRequested;
            plainPasteRequested = false;
            const text = event.clipboardData?.getData("text/plain") ?? "";
            if (!requested || text === "") {
              return false;
            }
            event.preventDefault();
            const { state } = view;
            const { $from } = state.selection;
            const transaction = $from.parent.type.spec.code
              ? state.tr.insertText(text.replace(/\r\n?/g, "\n"))
              : state.tr.replaceSelection(plainTextSlice(text, $from));
            // 貼った文字の中の URL を、autolink（打った URL をリンクに変える仕組み）でリンクにしない。
            view.dispatch(transaction.setMeta("preventAutolink", true).setMeta(PASTED_CONTENT_META, true).scrollIntoView());
            return true;
          },
        },
      },
    })];
  },
});
