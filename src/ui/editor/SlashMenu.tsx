// 「/」を打ったときに出る、ブロックの候補のメニュー。上下のキーで選び、Enter で決める。
// 絞り込みの文字に当たる候補が無いときは、黙って消さずに「見つかりません」を出す。

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { translate } from "../i18n/translate";
import type { SlashMenuController } from "./slashMenuController";

// メニューと、打った位置・画面の端との間。
const MENU_GAP = 6;
const VIEWPORT_MARGIN = 8;
const MENU_ICON_SIZE = 15;
// メニューの高さの上限（px）。候補は多いので、これを超える分はメニューの中で送る。
const MENU_MAX_HEIGHT = 520;

type MenuPlacement = { top: number; left: number; maxHeight: number };

// 打った行の下に入ればその下に出す。入らなければ、上と下の広い方に置き、高さをその空きまでに抑える（打っている行は覆わない）。
// 上に出すときは、メニューの下の端を、打った行の上に付ける。
// shared/PopupMenu.tsx の置き方と同じ考え方だが、こちらは押したボタンではなく打った位置から決め、キーボードが出ているスマホでは
// 見えている範囲の高さで測るので、別に持つ。
function placeSlashMenu(typedAt: DOMRect, menuSize: { width: number; height: number }): MenuPlacement {
  const visibleHeight = window.visualViewport?.height ?? window.innerHeight;
  const left = Math.min(Math.max(VIEWPORT_MARGIN, typedAt.left), window.innerWidth - menuSize.width - VIEWPORT_MARGIN);
  const spaceBelow = visibleHeight - VIEWPORT_MARGIN - (typedAt.bottom + MENU_GAP);
  const spaceAbove = typedAt.top - MENU_GAP - VIEWPORT_MARGIN;
  const height = Math.min(menuSize.height, MENU_MAX_HEIGHT);
  if (height <= spaceBelow || spaceBelow >= spaceAbove) {
    return { top: typedAt.bottom + MENU_GAP, left, maxHeight: Math.max(Math.min(spaceBelow, MENU_MAX_HEIGHT), 0) };
  }
  const maxHeight = Math.max(Math.min(spaceAbove, MENU_MAX_HEIGHT), 0);
  return { top: typedAt.top - MENU_GAP - Math.min(height, maxHeight), left, maxHeight };
}

export function SlashMenu({ controller }: { controller: SlashMenuController }) {
  const state = useSyncExternalStore(controller.subscribe, controller.state);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = useState<MenuPlacement>({ top: 0, left: 0, maxHeight: MENU_MAX_HEIGHT });
  const commands = state?.commands ?? [];
  const selected = Math.min(selectedIndex, Math.max(commands.length - 1, 0));

  // 絞り込みで候補が変わったら、先頭を選び直す。
  const commandIds = commands.map((command) => command.id).join(",");
  useEffect(() => setSelectedIndex(0), [commandIds]);

  useEffect(() => {
    if (state === null) {
      return;
    }
    controller.handleKey = (event) => {
      // 候補が無い間のキーは、本文に渡す（Enter は改行になる）。
      if (commands.length === 0) {
        return false;
      }
      if (event.key === "ArrowDown") {
        setSelectedIndex((selected + 1) % commands.length);
        return true;
      }
      if (event.key === "ArrowUp") {
        setSelectedIndex((selected - 1 + commands.length) % commands.length);
        return true;
      }
      if (event.key === "Enter") {
        const command = commands[selected];
        if (command) {
          state.choose(command);
        }
        return true;
      }
      return false;
    };
    return () => {
      controller.handleKey = null;
    };
  });

  // キーボードが出ているスマホでは、見えている範囲で測る。
  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (state === null || menu === null) {
      return;
    }
    // 高さの上限を外した、中身どおりの大きさで測ってから、上限を戻す。
    const currentMaxHeight = menu.style.maxHeight;
    menu.style.maxHeight = "none";
    const menuSize = menu.getBoundingClientRect();
    menu.style.maxHeight = currentMaxHeight;
    setPlacement(placeSlashMenu(state.anchor, menuSize));
  }, [state]);
  useLayoutEffect(() => {
    menuRef.current?.querySelector(".on")?.scrollIntoView({ block: "nearest" });
  }, [state, selected, placement]);

  if (state === null) {
    return null;
  }
  return (
    <div ref={menuRef} className="menu slash-menu" role="listbox" aria-label={translate("editor.slashMenu")} style={placement}>
      {commands.length === 0 && <div className="menu-empty" role="status">{translate("editor.slashMenuNoMatch")}</div>}
      {commands.map((command, index) => (
        <button key={command.id} type="button" role="option" aria-selected={index === selected} className={`menu-item${index === selected ? " on" : ""}`}
          // 押しても本文のカーソルを外さない。
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => state.choose(command)}>
          <command.icon size={MENU_ICON_SIZE} />{command.name()}
        </button>
      ))}
    </div>
  );
}
