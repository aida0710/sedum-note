// 持ち手を押すと開く、ブロックのメニュー（Notion と同じ形）。
//   変換: 本文・見出し・箇条書き・引用・コードなどに変える（文字のブロックと箇条書きの項目だけ）。何行かを選んでいるときは、選んだ行を全部変える。
//   動かす・複製・削除: キー（blockKeys.ts）と同じ操作。キー（設定で変えたもの）を右に出す。

import type { Editor } from "@tiptap/react";
import {
  ArrowDown, ArrowUp, Check, Code, Copy, Heading1, Heading2, Heading3, Heading4, Heading5, Heading6, List, ListChecks, ListOrdered, type LucideIcon, Pilcrow, TextQuote, Trash2,
} from "lucide-react";
import { useSyncExternalStore } from "react";
import { type MessageKey, translate } from "../i18n/translate";
import { useDevicePreferences } from "../preferences/devicePreferences";
import { PopupMenu } from "../shared/PopupMenu";
import { type BlockKind, BLOCK_KINDS, blockAt, canChangeKind, changeBlockKind, deleteBlock, duplicateBlock, kindOf, moveBlock } from "./blockOperations";
import { shortcutTextOf } from "../shortcuts/shortcutBindings";
import type { ShortcutId } from "../shortcuts/shortcutCatalog";
import type { BlockMenuController } from "./blockMenuController";

// メニューの項目のアイコンの大きさ。ほかのメニュー（メモの「…」など）と同じ。
const MENU_ICON_SIZE = 15;

const KIND_ITEMS: Record<BlockKind, { label: MessageKey; Icon: LucideIcon }> = {
  paragraph: { label: "editor.paragraph", Icon: Pilcrow },
  heading1: { label: "editor.heading1", Icon: Heading1 },
  heading2: { label: "editor.heading2", Icon: Heading2 },
  heading3: { label: "editor.heading3", Icon: Heading3 },
  heading4: { label: "editor.heading4", Icon: Heading4 },
  heading5: { label: "editor.heading5", Icon: Heading5 },
  heading6: { label: "editor.heading6", Icon: Heading6 },
  bulletList: { label: "editor.bulletList", Icon: List },
  orderedList: { label: "editor.orderedList", Icon: ListOrdered },
  taskList: { label: "editor.taskList", Icon: ListChecks },
  blockquote: { label: "editor.blockquote", Icon: TextQuote },
  codeBlock: { label: "editor.code", Icon: Code },
};

type BlockMenuProps = { editor: Editor; controller: BlockMenuController };

export function BlockMenu({ editor, controller }: BlockMenuProps) {
  const state = useSyncExternalStore(controller.subscribe, controller.state);
  const { shortcutOverrides } = useDevicePreferences();
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
  // 設定で変えたキー。キーなしにしたものは出さない。
  const keysText = (id: ShortcutId) => shortcutTextOf(id, shortcutOverrides);
  const item = (label: MessageKey, Icon: LucideIcon, onSelect: () => void, { shortcut, checked, danger }: { shortcut?: string | null; checked?: boolean; danger?: boolean } = {}) => (
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
        {item("editor.block.moveUp", ArrowUp, run(() => moveBlock(editor, block, -1)), { shortcut: keysText("moveBlockUp") })}
        {item("editor.block.moveDown", ArrowDown, run(() => moveBlock(editor, block, 1)), { shortcut: keysText("moveBlockDown") })}
        {item("editor.block.duplicate", Copy, run(() => duplicateBlock(editor, block)), { shortcut: keysText("duplicateBlock") })}
      </div>
      <div className="menu-group" role="group">
        {item("editor.block.delete", Trash2, run(() => deleteBlock(editor, block)), { danger: true })}
      </div>
    </PopupMenu>
  );
}
