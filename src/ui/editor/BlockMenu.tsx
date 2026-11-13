// 持ち手を押すと開く、ブロックのメニュー（Notion と同じ形）。
//   変換: 本文・見出し・箇条書き・引用・コードなどに変える（文字のブロックと箇条書きの項目だけ）。何行かを選んでいるときは、選んだ行を全部変える。
//   動かす・複製・削除: キー（blockKeys.ts）と同じ操作。キーを右に出す。

import type { Editor } from "@tiptap/react";
import {
  ArrowDown, ArrowUp, Check, Code, Copy, Heading1, Heading2, Heading3, List, ListChecks, ListOrdered, type LucideIcon, Pilcrow, TextQuote, Trash2,
} from "lucide-react";
import { useSyncExternalStore } from "react";
import { type MessageKey, translate } from "../i18n/translate";
import { PopupMenu } from "../shared/PopupMenu";
import { shortcutText } from "../shared/shortcutKeys";
import { type BlockKind, BLOCK_KINDS, blockAt, canChangeKind, changeBlockKind, deleteBlock, duplicateBlock, kindOf, moveBlock } from "./blockOperations";
import { DUPLICATE_BLOCK_KEYS, MOVE_BLOCK_DOWN_KEYS, MOVE_BLOCK_UP_KEYS } from "./blockKeys";
import type { BlockMenuController } from "./blockMenuController";

// メニューの項目のアイコンの大きさ。ほかのメニュー（メモの「…」など）と同じ。
const MENU_ICON_SIZE = 15;

const KIND_ITEMS: Record<BlockKind, { label: MessageKey; Icon: LucideIcon }> = {
  paragraph: { label: "editor.paragraph", Icon: Pilcrow },
  heading1: { label: "editor.heading1", Icon: Heading1 },
  heading2: { label: "editor.heading2", Icon: Heading2 },
  heading3: { label: "editor.heading3", Icon: Heading3 },
  bulletList: { label: "editor.bulletList", Icon: List },
  orderedList: { label: "editor.orderedList", Icon: ListOrdered },
  taskList: { label: "editor.taskList", Icon: ListChecks },
  blockquote: { label: "editor.blockquote", Icon: TextQuote },
  codeBlock: { label: "editor.code", Icon: Code },
};

type BlockMenuProps = { editor: Editor; controller: BlockMenuController };

export function BlockMenu({ editor, controller }: BlockMenuProps) {
  const state = useSyncExternalStore(controller.subscribe, controller.state);
  const block = state ? blockAt(editor.state, state.position) : null;
  if (!state || !block) {
    return null;
  }
  const close = () => controller.close();
  const run = (operation: () => boolean) => () => {
    close();
    operation();
    editor.view.focus();
  };
  const currentKind = kindOf(editor.state, block);
  const item = (label: MessageKey, Icon: LucideIcon, onSelect: () => void, { shortcut, checked, danger }: { shortcut?: string; checked?: boolean; danger?: boolean } = {}) => (
    <button key={label} type="button" className={`menu-item${danger ? " danger" : ""}`} role={checked === undefined ? "menuitem" : "menuitemradio"} aria-checked={checked}
      onMouseDown={(event) => event.preventDefault()} onClick={onSelect}>
      <Icon size={MENU_ICON_SIZE} />{translate(label)}
      {checked && <Check size={MENU_ICON_SIZE} className="menu-check" />}
      {shortcut && <kbd>{shortcut}</kbd>}
    </button>
  );
  return (
    <PopupMenu anchor={state.anchor} onClose={close} align="start">
      {canChangeKind(block) && (
        <div className="menu-group" role="group" aria-label={translate("editor.block.turnInto")}>
          <div className="menu-heading">{translate("editor.block.turnInto")}</div>
          {BLOCK_KINDS.map((kind) => item(KIND_ITEMS[kind].label, KIND_ITEMS[kind].Icon, run(() => changeBlockKind(editor, block, kind)), { checked: kind === currentKind }))}
        </div>
      )}
      <div className="menu-group" role="group">
        {item("editor.block.moveUp", ArrowUp, run(() => moveBlock(editor, block, -1)), { shortcut: shortcutText(MOVE_BLOCK_UP_KEYS) })}
        {item("editor.block.moveDown", ArrowDown, run(() => moveBlock(editor, block, 1)), { shortcut: shortcutText(MOVE_BLOCK_DOWN_KEYS) })}
        {item("editor.block.duplicate", Copy, run(() => duplicateBlock(editor, block)), { shortcut: shortcutText(DUPLICATE_BLOCK_KEYS) })}
      </div>
      <div className="menu-group" role="group">
        {item("editor.block.delete", Trash2, run(() => deleteBlock(editor, block)), { danger: true })}
      </div>
    </PopupMenu>
  );
}
