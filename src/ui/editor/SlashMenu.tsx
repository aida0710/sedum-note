// 「/」を打ったときに出る、ブロックの候補のメニュー。上下のキーで選び、Enter で決める。

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { translate } from "../i18n/translate";
import type { SlashMenuController } from "./slashMenuController";

// メニューと、打った位置・画面の端との間。
const MENU_GAP = 6;
const VIEWPORT_MARGIN = 8;
const MENU_ICON_SIZE = 15;

export function SlashMenu({ controller }: { controller: SlashMenuController }) {
  const state = useSyncExternalStore(controller.subscribe, controller.state);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });
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

  // 打った位置の下に出す。下に収まらなければ上に出す。キーボードが出ているスマホでは、見えている範囲で測る。
  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (state === null || menu === null) {
      return;
    }
    const visibleHeight = window.visualViewport?.height ?? window.innerHeight;
    const { width, height } = menu.getBoundingClientRect();
    const below = state.anchor.bottom + MENU_GAP;
    const top = below + height > visibleHeight - VIEWPORT_MARGIN ? Math.max(VIEWPORT_MARGIN, state.anchor.top - height - MENU_GAP) : below;
    const left = Math.min(Math.max(VIEWPORT_MARGIN, state.anchor.left), window.innerWidth - width - VIEWPORT_MARGIN);
    setPosition({ top, left });
    menu.querySelector(".on")?.scrollIntoView({ block: "nearest" });
  }, [state, selected]);

  if (state === null) {
    return null;
  }
  return (
    <div ref={menuRef} className="menu slash-menu" role="listbox" aria-label={translate("editor.slashMenu")} style={position}>
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
