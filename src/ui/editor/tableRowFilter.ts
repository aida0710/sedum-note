// 表の行のフィルター。選んだ列に言葉を含まない行を、画面から隠す。隠すだけで、行は消さない。
// 表示のための飾り（decoration）なので、本文は変わらず、同期もされない。メモを開き直すと解除される。

import { Extension } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { selectedRect } from "@tiptap/pm/tables";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

// フィルターをかけている表（文書の中の位置）と、その条件。
export type TableRowFilter = { tablePosition: number; column: number; text: string };

type TableRowFilterMeta = { filter: TableRowFilter | null };

export const tableRowFilterKey = new PluginKey<TableRowFilter | null>("tableRowFilter");

const HEADER_CELL = "tableHeader";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    tableRowFilter: {
      // カーソルのある列に text を含む行だけを出す。
      filterTableRows: (text: string) => ReturnType;
      clearTableRowFilter: () => ReturnType;
    };
  }
}

function rowMatches(row: ProseMirrorNode, filter: TableRowFilter): boolean {
  const cell = row.child(Math.min(filter.column, row.childCount - 1));
  // ヘッダーの行は、いつも出す。
  return cell.type.name === HEADER_CELL || cell.textContent.toLocaleLowerCase().includes(filter.text.toLocaleLowerCase());
}

function filterDecorations(doc: ProseMirrorNode, filter: TableRowFilter | null): DecorationSet {
  const table = filter ? doc.nodeAt(filter.tablePosition) : null;
  if (!filter || table?.type.name !== "table") {
    return DecorationSet.empty;
  }
  const decorations = [Decoration.node(filter.tablePosition, filter.tablePosition + table.nodeSize, { class: "rows-filtered" })];
  table.forEach((row, offset) => {
    if (!rowMatches(row, filter)) {
      const rowPosition = filter.tablePosition + 1 + offset;
      decorations.push(Decoration.node(rowPosition, rowPosition + row.nodeSize, { class: "filtered-out-row" }));
    }
  });
  return DecorationSet.create(doc, decorations);
}

export const TableRowFilterExtension = Extension.create({
  name: "tableRowFilter",
  addCommands() {
    return {
      filterTableRows: (text) => ({ state, tr, dispatch, editor }) => {
        if (!editor.isActive("table") || text.trim() === "") {
          return false;
        }
        const { tableStart, left } = selectedRect(state);
        dispatch?.(tr.setMeta(tableRowFilterKey, { filter: { tablePosition: tableStart - 1, column: left, text: text.trim() } } satisfies TableRowFilterMeta));
        return true;
      },
      clearTableRowFilter: () => ({ tr, dispatch }) => {
        dispatch?.(tr.setMeta(tableRowFilterKey, { filter: null } satisfies TableRowFilterMeta));
        return true;
      },
    };
  },
  addProseMirrorPlugins() {
    return [
      new Plugin<TableRowFilter | null>({
        key: tableRowFilterKey,
        state: {
          init: () => null,
          apply(transaction, current) {
            const meta = transaction.getMeta(tableRowFilterKey) as TableRowFilterMeta | undefined;
            if (meta) {
              return meta.filter;
            }
            if (!current || !transaction.docChanged) {
              return current;
            }
            // 表より前の文字が増減したら、表の位置を追いかける。表が消えたら解除する。
            const mapped = transaction.mapping.mapResult(current.tablePosition, 1);
            return mapped.deleted ? null : { ...current, tablePosition: mapped.pos };
          },
        },
        props: {
          decorations: (state) => filterDecorations(state.doc, tableRowFilterKey.getState(state) ?? null),
        },
      }),
    ];
  },
});
