// 絞り込みの欄にフォーカスを置いたまま、下の一覧の項目をキーで選ぶ（コマンドパレット、メモやブロックを選ぶダイアログ）。
//   ↑ ↓ で前後の項目へ（端では反対の端へ回る）、Home と End で最初と最後の項目へ移る。
//   選んだ項目が一覧の見える範囲の外にあれば、見える所まで送る。選んでいる項目にはクラス on を付けておく。

import { type KeyboardEvent, type RefObject, useEffect, useRef, useState } from "react";

type KeyboardListSelection = {
  // 選んでいる項目の番号。項目が減ったら、最後の項目に収める。
  selected: number;
  // 絞り込みの言葉が変わったときに呼ぶ（先頭の項目を選び直す）。
  selectFirst: () => void;
  // 一覧の要素に付ける。
  list: RefObject<HTMLDivElement | null>;
  // 欄の onKeyDown で呼ぶ。選ぶ項目を動かしたら true（既定の動きは止めてある）。
  moveSelectionByKey: (event: KeyboardEvent<HTMLInputElement>) => boolean;
};

export function useKeyboardListSelection(itemCount: number): KeyboardListSelection {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const selected = Math.min(selectedIndex, Math.max(itemCount - 1, 0));
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (selected === 0) {
      // 先頭の項目では、その上の見出しも見えるよう、一覧の先頭まで戻す。
      list.current?.scrollTo({ top: 0 });
      return;
    }
    list.current?.querySelector(".on")?.scrollIntoView({ block: "nearest" });
  }, [selected, itemCount]);
  const moves: Record<string, () => number> = {
    ArrowDown: () => (selected + 1) % itemCount,
    ArrowUp: () => (selected - 1 + itemCount) % itemCount,
    Home: () => 0,
    End: () => itemCount - 1,
  };
  const moveSelectionByKey = (event: KeyboardEvent<HTMLInputElement>): boolean => {
    const move = moves[event.key];
    // Home と End は、言葉を打っている間は欄の中のカーソルを動かすのに使う。
    const movesCursorInInput = (event.key === "Home" || event.key === "End") && event.currentTarget.value !== "";
    if (move === undefined || movesCursorInInput) {
      return false;
    }
    event.preventDefault();
    setSelectedIndex(itemCount === 0 ? 0 : move());
    return true;
  };
  return { selected, selectFirst: () => setSelectedIndex(0), list, moveSelectionByKey };
}
