// コマンドパレット。キーボードから、メモを題で探して開く。「>」で始めると、操作の名前で探して実行する。

import { Search } from "lucide-react";
import { useState } from "react";
import type { LiveNote } from "../../core/notes/noteRecords";
import { translate } from "../i18n/translate";
import { isImeKeyEvent } from "../shared/imeKeyEvent";
import { ModalDialog } from "../shared/ModalDialog";

export type PaletteCommand = { id: string; label: string; shortcut: string; run: () => void };

type CommandPaletteProps = {
  // 開けるメモ（ゴミ箱の外）。
  notes: LiveNote[];
  commands: PaletteCommand[];
  onOpenNote: (noteId: string) => void;
  onClose: () => void;
};

// 入力の先頭に置くと、メモではなく操作を探す印。
const COMMAND_PREFIX = ">";
// 一度に並べる件数。これより多いときは、打って絞ってもらう。
const MAX_LISTED_ITEMS = 30;

type PaletteItem = { id: string; label: string; hint: string; run: () => void };

function matchesWords(label: string, query: string): boolean {
  const haystack = label.toLocaleLowerCase();
  return query.toLocaleLowerCase().split(/\s+/).every((word) => haystack.includes(word));
}

export function CommandPalette({ notes, commands, onOpenNote, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const searchesCommands = query.startsWith(COMMAND_PREFIX);
  const words = (searchesCommands ? query.slice(COMMAND_PREFIX.length) : query).trim();
  const items: PaletteItem[] = searchesCommands
    ? commands.filter((command) => matchesWords(command.label, words)).map((command) => ({ id: command.id, label: command.label, hint: command.shortcut, run: command.run }))
    : notes
      .filter((note) => matchesWords(note.content.title, words))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, MAX_LISTED_ITEMS)
      .map((note) => ({ id: note.id, label: note.content.title || translate("sidebar.untitled"), hint: "", run: () => onOpenNote(note.id) }));
  const selected = Math.min(selectedIndex, Math.max(items.length - 1, 0));
  const runItem = (item: PaletteItem | undefined) => {
    if (item) {
      onClose();
      item.run();
    }
  };
  return (
    <ModalDialog label={translate("palette.title")} className="note-picker command-palette" onClose={onClose}>
      <label className="sidebar-search">
        <Search size={14} />
        <input autoFocus value={query} placeholder={translate("palette.placeholder")} aria-label={translate("palette.title")}
          role="combobox" aria-expanded aria-controls="command-palette-list" aria-activedescendant={items[selected] ? `palette-item-${items[selected].id}` : undefined}
          onChange={(event) => { setQuery(event.target.value); setSelectedIndex(0); }}
          onKeyDown={(event) => {
            if (isImeKeyEvent(event.nativeEvent)) {
              return;
            }
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              const step = event.key === "ArrowDown" ? 1 : -1;
              setSelectedIndex(items.length === 0 ? 0 : (selected + step + items.length) % items.length);
            } else if (event.key === "Enter") {
              event.preventDefault();
              runItem(items[selected]);
            }
          }} />
      </label>
      <div className="note-picker-list" id="command-palette-list" role="listbox">
        {items.length === 0 && <div className="tree-empty">{translate("palette.noResults")}</div>}
        {items.map((item, index) => (
          <button key={item.id} id={`palette-item-${item.id}`} type="button" role="option" aria-selected={index === selected}
            className={`menu-item${index === selected ? " on" : ""}`} onClick={() => runItem(item)}>
            <span className="nav-label">{item.label}</span>
            {item.hint && <kbd>{item.hint}</kbd>}
          </button>
        ))}
      </div>
    </ModalDialog>
  );
}
