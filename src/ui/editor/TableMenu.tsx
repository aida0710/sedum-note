// ツールバーの表のメニュー。表の外では表の挿入、表の中では行・列の追加と削除、セルの結合、ヘッダー、列の揃え方を出す。

import type { Editor } from "@tiptap/react";
import { Table } from "lucide-react";
import { useState } from "react";
import { translate, type MessageKey } from "../i18n/translate";
import { PopupMenu } from "../shared/PopupMenu";
import { NEW_TABLE_SIZE } from "./slashCommands";
import { type ColumnAlignment, columnAlignmentAtSelection, setColumnAlignment } from "./tableColumnAlignment";
import { tableHeadersAtSelection } from "./tableHeaders";

type TableMenuProps = { editor: Editor; insideTable: boolean; iconSize: number };

const COLUMN_ALIGNMENTS: Array<{ alignment: ColumnAlignment; label: MessageKey }> = [
  { alignment: "left", label: "editor.table.alignLeft" },
  { alignment: "center", label: "editor.table.alignCenter" },
  { alignment: "right", label: "editor.table.alignRight" },
];

type MenuItemOptions = { danger?: boolean; disabled?: boolean; checked?: boolean };

export function TableMenu({ editor, insideTable, iconSize }: TableMenuProps) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const item = (label: MessageKey, run: () => void, { danger = false, disabled = false, checked }: MenuItemOptions = {}) => (
    <button type="button" className={`menu-item${danger ? " danger" : ""}${checked ? " on" : ""}`} disabled={disabled}
      role={checked === undefined ? "menuitem" : "menuitemcheckbox"} aria-checked={checked}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => { setAnchor(null); run(); }}>
      {translate(label)}
    </button>
  );
  const commands = () => editor.chain().focus();
  // メニューを開いた時点の表の状態。押すとメニューを閉じるので、開いている間は変わらない。
  const headers = tableHeadersAtSelection(editor);
  const columnAlignment = columnAlignmentAtSelection(editor);
  return (
    <>
      <button type="button" className={`tool${insideTable ? " on" : ""}`} title={translate("editor.table")} aria-label={translate("editor.table")}
        aria-haspopup="menu" onMouseDown={(event) => event.preventDefault()}
        onClick={(event) => setAnchor(anchor ? null : event.currentTarget)}>
        <Table size={iconSize} />
      </button>
      {anchor && (
        <PopupMenu anchor={anchor} onClose={() => setAnchor(null)}>
          {!insideTable && item("editor.table.insert", () =>
            commands().insertTable(NEW_TABLE_SIZE).run())}
          {insideTable && (
            <div className="table-menu">
              {item("editor.table.addRowBefore", () => commands().addRowBefore().run())}
              {item("editor.table.addRowAfter", () => commands().addRowAfter().run())}
              {item("editor.table.addColumnBefore", () => commands().addColumnBefore().run())}
              {item("editor.table.addColumnAfter", () => commands().addColumnAfter().run())}
              <div className="menu-separator" />
              {item("editor.table.mergeCells", () => commands().mergeCells().run(), { disabled: !editor.can().mergeCells() })}
              {item("editor.table.splitCell", () => commands().splitCell().run(), { disabled: !editor.can().splitCell() })}
              <div className="menu-separator" />
              {item("editor.table.headerRow", () => commands().toggleHeaderRow().run(), { checked: headers.row })}
              {item("editor.table.headerColumn", () => commands().toggleHeaderColumn().run(), { checked: headers.column })}
              <div className="menu-separator" />
              {COLUMN_ALIGNMENTS.map(({ alignment, label }) =>
                <span key={alignment}>{item(label, () => setColumnAlignment(editor, alignment), { checked: columnAlignment === alignment })}</span>)}
              <div className="menu-separator" />
              {item("editor.table.deleteRow", () => commands().deleteRow().run())}
              {item("editor.table.deleteColumn", () => commands().deleteColumn().run())}
              {item("editor.table.delete", () => commands().deleteTable().run(), { danger: true })}
            </div>
          )}
        </PopupMenu>
      )}
    </>
  );
}
