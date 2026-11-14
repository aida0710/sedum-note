// 「/」を打ったときに出る、ブロックの候補のメニュー。上下のキーで選び、Enter で決める。
// 打つ前は「最近使った」と、まとまりの見出しを付けて並べる（slashMenuSections.ts）。候補はメニューの中で送るが、スクロールバーは出さず、
// 下にまだ候補があるときは下の端をぼかして知らせる。絞り込みの文字に当たる候補が無いときは、黙って消さずに「見つかりません」を出す。

import { useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { translate } from "../i18n/translate";
import { useDevicePreferences } from "../preferences/devicePreferences";
import type { SlashCommand } from "./slashCommands";
import type { SlashMenuController } from "./slashMenuController";
import { slashMenuSections } from "./slashMenuSections";

// メニューと、打った位置・画面の端との間。
const MENU_GAP = 6;
const VIEWPORT_MARGIN = 8;
const MENU_ICON_SIZE = 15;
// メニューの高さの上限（px）。候補は多いので、これを超える分はメニューの中で送る。
const MENU_MAX_HEIGHT = 520;
// 下の端まで送ったと見なす残り（px）。画面の倍率で、送れる量の端に小数の残りが出るため。
const SCROLL_END_TOLERANCE = 1;

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
  const [hasMoreBelow, setHasMoreBelow] = useState(false);
  const { recentSlashCommandIds } = useDevicePreferences();
  const optionIdPrefix = useId();
  const sections = slashMenuSections({ commands: state?.commands ?? [], query: state?.query ?? "", recentCommandIds: recentSlashCommandIds });
  // 上下のキーで動く順。「最近使った」の候補は、下のまとまりにも同じものがある。
  const commands = sections.flatMap((section) => section.commands);
  const selected = Math.min(selectedIndex, Math.max(commands.length - 1, 0));

  // 絞り込みで候補が変わったら、先頭を選び直す。
  const sectionsKey = sections.map((section) => `${section.heading}:${section.commands.map((command) => command.id).join(",")}`).join("|");
  useEffect(() => setSelectedIndex(0), [sectionsKey]);

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
    updateHasMoreBelow();
  }, [state, selected, placement]);

  function updateHasMoreBelow(): void {
    const menu = menuRef.current;
    setHasMoreBelow(menu !== null && menu.scrollTop + menu.clientHeight < menu.scrollHeight - SCROLL_END_TOLERANCE);
  }

  if (state === null) {
    return null;
  }
  let optionIndex = 0;
  return (
    <div ref={menuRef} className="menu slash-menu" role="listbox" aria-label={translate("editor.slashMenu")} style={placement} onScroll={updateHasMoreBelow}>
      {commands.length === 0 && <div className="menu-empty" role="status">{translate("editor.slashMenuNoMatch")}</div>}
      {sections.map((section) => {
        const headingText = section.heading === null ? null : translate(`editor.slashGroup.${section.heading}`);
        return (
          <div key={section.heading ?? "matches"} className="slash-menu-group" role={headingText === null ? undefined : "group"} aria-label={headingText ?? undefined}>
            {headingText !== null && <div className="menu-heading" aria-hidden="true">{headingText}</div>}
            {section.commands.map((command) => {
              const index = optionIndex++;
              return (
                <SlashMenuOption key={command.id} command={command} descriptionId={`${optionIdPrefix}-${index}-description`} selected={index === selected}
                  onChoose={() => state.choose(command)} />
              );
            })}
          </div>
        );
      })}
      <div className={`slash-menu-fade${hasMoreBelow ? " shown" : ""}`} aria-hidden="true" />
    </div>
  );
}

type SlashMenuOptionProps = {
  command: SlashCommand;
  // 説明の文の id。説明を、候補の読み上げの説明として結び付ける。
  descriptionId: string;
  selected: boolean;
  onChoose: () => void;
};

function SlashMenuOption({ command, descriptionId, selected, onChoose }: SlashMenuOptionProps) {
  const name = command.name();
  const description = command.description?.();
  return (
    // 読み上げの名前は候補の名前だけにする（説明と近道の文字まで名前に入れない）。
    <button type="button" role="option" aria-selected={selected} aria-label={name} aria-describedby={description === undefined ? undefined : descriptionId}
      className={`menu-item${selected ? " on" : ""}`}
      // 押しても本文のカーソルを外さない。
      onMouseDown={(event) => event.preventDefault()}
      onClick={onChoose}>
      <command.icon size={MENU_ICON_SIZE} />
      <span className="slash-menu-label">
        <span className="slash-menu-name">{name}</span>
        {description !== undefined && <span className="slash-menu-description" id={descriptionId}>{description}</span>}
      </span>
      {command.shortcut !== undefined && <kbd className="slash-menu-shortcut" aria-hidden="true">{command.shortcut}</kbd>}
    </button>
  );
}
