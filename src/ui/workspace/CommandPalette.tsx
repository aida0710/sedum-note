// コマンドパレット（Ctrl+K）。打った言葉で、メモ（題と本文）・ノートブック・タグ・設定の項目・操作をまとめて探し、
// 種類ごとに並べる。「>」で始めると、操作だけを探す。何も打っていないときは、最近のメモと、よく使う操作を並べる。

import { BookOpen, FilePlus, FileText, Hash, type LucideIcon, Search, Settings, Zap } from "lucide-react";
import { Fragment, useEffect, useRef, useState } from "react";
import { type MessageKey, translate } from "../i18n/translate";
import { isImeKeyEvent } from "../shared/imeKeyEvent";
import { ModalDialog } from "../shared/ModalDialog";
import { COMMAND_PREFIX, type PaletteCandidate, type PaletteItem, type PaletteItemKind, searchPalette } from "./paletteItems";

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

const ICON_SIZE = 15;

export function CommandPalette({ candidates, onCreateNote, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const newNoteTitle = query.trim();
  // 言葉を打ったら、最後に「その題で新しいメモを作る」を出す。操作を探しているときと、同じ題のメモがもうあるときは出さない。
  const sameTitleExists = candidates.some((candidate) => candidate.kind === "note" && candidate.label === newNoteTitle);
  const createItem: PaletteItem | null = newNoteTitle === "" || query.startsWith(COMMAND_PREFIX) || sameTitleExists ? null : {
    id: "create-note", kind: "create", label: translate("palette.createNote", { title: newNoteTitle }), hint: "", run: () => onCreateNote(newNoteTitle),
  };
  const items = [...searchPalette(candidates, query), ...(createItem ? [createItem] : [])];
  const selected = Math.min(selectedIndex, Math.max(items.length - 1, 0));
  // キーで選んだ項目が一覧の見える範囲の外にあれば、見える所まで送る。
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (selected === 0) {
      // 先頭の項目では、その上のまとまりの見出しも見えるよう、一覧の先頭まで戻す。
      list.current?.scrollTo({ top: 0 });
      return;
    }
    list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
  }, [selected, query]);
  // 押したキーごとの、次に選ぶ項目の番号。↑↓ は端で反対の端へ回る。
  const selectionMoves: Record<string, () => number> = {
    ArrowDown: () => (selected + 1) % items.length,
    ArrowUp: () => (selected - 1 + items.length) % items.length,
    Home: () => 0,
    End: () => items.length - 1,
  };
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
            const moveSelection = selectionMoves[event.key];
            // Home と End は、言葉を打っている間は欄の中のカーソルを動かすのに使う。
            const movesCursorInInput = (event.key === "Home" || event.key === "End") && query !== "";
            if (moveSelection && !movesCursorInInput) {
              event.preventDefault();
              setSelectedIndex(items.length === 0 ? 0 : moveSelection());
            } else if (event.key === "Enter") {
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
                <Icon size={ICON_SIZE} className="palette-item-icon" />
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
