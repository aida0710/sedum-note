// ツールバーの表のメニュー。表の外では表の挿入、表の中では行・列の追加と削除を出す。

import type { Editor } from "@tiptap/react";
import { Table } from "lucide-react";
import { useState } from "react";
import { translate, type MessageKey } from "../i18n/translate";
import { PopupMenu } from "../shared/PopupMenu";
import { NEW_TABLE_SIZE } from "./slashCommands";

type TableMenuProps = { editor: Editor; insideTable: boolean; iconSize: number };

export function TableMenu({ editor, insideTable, iconSize }: TableMenuProps) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const item = (label: MessageKey, run: () => void, danger = false) => (
    <button type="button" className={`menu-item${danger ? " danger" : ""}`} role="menuitem"
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => { setAnchor(null); run(); }}>
      {translate(label)}
    </button>
  );
  const commands = () => editor.chain().focus();
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
            <>
              {item("editor.table.addRow", () => commands().addRowAfter().run())}
              {item("editor.table.addColumn", () => commands().addColumnAfter().run())}
              <div className="menu-separator" />
              {item("editor.table.deleteRow", () => commands().deleteRow().run())}
              {item("editor.table.deleteColumn", () => commands().deleteColumn().run())}
              {item("editor.table.delete", () => commands().deleteTable().run(), true)}
            </>
          )}
        </PopupMenu>
      )}
    </>
  );
}
