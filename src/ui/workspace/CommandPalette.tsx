// コマンドパレット（Ctrl+K）。打った言葉で、メモ（題と本文）・ノートブック・タグ・設定の項目・操作をまとめて探し、
// 種類ごとに並べる。「>」で始めると、操作だけを探す。何も打っていないときは、最近のメモと、よく使う操作を並べる。

import { BookOpen, FilePlus, FileText, Hash, type LucideIcon, Search, Settings, Zap } from "lucide-react";
import { Fragment, useState } from "react";
import { type MessageKey, translate } from "../i18n/translate";
import { isImeKeyEvent } from "../shared/imeKeyEvent";
import { ModalDialog } from "../shared/ModalDialog";
import { useKeyboardListSelection } from "../shared/useKeyboardListSelection";
import { COMMAND_PREFIX, type PaletteCandidate, type PaletteItem, type PaletteItemKind, searchPalette } from "./paletteItems";
import { ICON_SIZE } from "../shared/iconSizes";

type CommandPaletteProps = {
  candidates: PaletteCandidate[];
  // 打った言葉を題にして、新しいメモを作る。
  onCreateNote: (title: string) => void;
  onClose: () => void;
};

const KIND_META: Record<PaletteItemKind, { heading: MessageKey; icon: LucideIcon }> = {
  note: { heading: "palette.group.notes", icon: FileText },
  notebook: { heading: "palette.group.notebooks", icon: BookOpen },
  tag: { heading: "palette.group.tags", icon: Hash },
  setting: { heading: "palette.group.settings", icon: Settings },
  command: { heading: "palette.group.commands", icon: Zap },
  create: { heading: "palette.group.create", icon: FilePlus },
};

export function CommandPalette({ candidates, onCreateNote, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const newNoteTitle = query.trim();
  // 言葉を打ったら、最後に「その題で新しいメモを作る」を出す。操作を探しているときと、同じ題のメモがもうあるときは出さない。
  const sameTitleExists = candidates.some((candidate) => candidate.kind === "note" && candidate.label === newNoteTitle);
  const createItem: PaletteItem | null = newNoteTitle === "" || query.startsWith(COMMAND_PREFIX) || sameTitleExists ? null : {
    id: "create-note", kind: "create", label: translate("palette.createNote", { title: newNoteTitle }), hint: "", run: () => onCreateNote(newNoteTitle),
  };
  const items = [...searchPalette(candidates, query), ...(createItem ? [createItem] : [])];
  const { selected, selectFirst, list, moveSelectionByKey } = useKeyboardListSelection(items.length);
  const runItem = (item: PaletteItem | undefined) => {
    if (item) {
      onClose();
      item.run();
    }
  };
  return (
    <ModalDialog label={translate("palette.title")} className="note-picker command-palette" onClose={onClose}>
      <label className="sidebar-search">
        <Search size={ICON_SIZE.row} />
        <input autoFocus value={query} placeholder={translate("palette.placeholder")} aria-label={translate("palette.title")}
          role="combobox" aria-expanded aria-controls="command-palette-list" aria-activedescendant={items[selected] ? `palette-item-${items[selected].id}` : undefined}
          onChange={(event) => { setQuery(event.target.value); selectFirst(); }}
          onKeyDown={(event) => {
            if (isImeKeyEvent(event.nativeEvent)) {
              return;
            }
            if (!moveSelectionByKey(event) && event.key === "Enter") {
              event.preventDefault();
              runItem(items[selected]);
            }
          }} />
      </label>
      <div ref={list} className="note-picker-list" id="command-palette-list" role="listbox">
        {items.length === 0 && <div className="tree-empty">{translate("palette.noResults")}</div>}
        {items.map((item, index) => {
          const { heading, icon: Icon } = KIND_META[item.kind];
          const startsGroup = index === 0 || items[index - 1]!.kind !== item.kind;
          return (
            <Fragment key={item.id}>
              {startsGroup && <div className="menu-heading" role="presentation">{translate(heading)}</div>}
              <button id={`palette-item-${item.id}`} type="button" role="option" aria-selected={index === selected}
                className={`menu-item${index === selected ? " on" : ""}`} onClick={() => runItem(item)}>
                <Icon size={ICON_SIZE.row} className="palette-item-icon" />
                <span className="nav-label">{item.label}</span>
                {item.hint && (item.kind === "command" ? <kbd>{item.hint}</kbd> : <span className="palette-item-hint">{item.hint}</span>)}
              </button>
            </Fragment>
          );
        })}
      </div>
    </ModalDialog>
  );
}
