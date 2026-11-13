// 貼り付けとドロップを、前後に打った文字とは別の取り消しの単位にする。取り消し（Yjs の UndoManager）は、間の短い変更を
// 1 回にまとめるので、打った直後に貼ると、Ctrl+Z 1 回で打った文字まで消えていた。貼った変更の前と、そのあとの最初の変更の前で区切る。
//
// 区切るのは、変更が本文へ書かれる前（appendTransaction。Yjs への書き込みは、このあとの描画で行われる）。

import { Extension } from "@tiptap/core";
import { Plugin, PluginKey, type Transaction } from "@tiptap/pm/state";
import { startNewUndoStep } from "./undoSteps";

// エディタの既定の処理を通らずに貼った変更（Markdown の取り込み、書式なしの貼り付け）に付ける印。
export const PASTED_CONTENT_META = "pastedContent";

function isPastedContent(transaction: Transaction): boolean {
  const uiEvent = transaction.getMeta("uiEvent");
  return uiEvent === "paste" || uiEvent === "drop" || transaction.getMeta(PASTED_CONTENT_META) === true;
}

// 最後に本文を変えたのが、貼り付けかドロップか。
const lastChangeKey = new PluginKey<boolean>("pasteUndoStep");

export const PasteUndoStep = Extension.create({
  name: "pasteUndoStep",

  addProseMirrorPlugins() {
    return [new Plugin<boolean>({
      key: lastChangeKey,
      state: {
        init: () => false,
        apply: (transaction, lastChangeWasPaste) => (transaction.docChanged ? isPastedContent(transaction) : lastChangeWasPaste),
      },
      appendTransaction: (transactions, oldState) => {
        const lastChangeWasPaste = lastChangeKey.getState(oldState) ?? false;
        const changes = transactions.filter((transaction) => transaction.docChanged);
        if (changes.some(isPastedContent) || (lastChangeWasPaste && changes.length > 0)) {
          startNewUndoStep(oldState);
        }
        return null;
      },
    })];
  },
});
