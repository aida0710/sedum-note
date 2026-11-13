// 縦に並んだ項目の間を、↑ ↓ Home End でフォーカスを移す（左の列の木、履歴の一覧、ノートブックを選ぶ一覧）。
// 項目を並べた要素の onKeyDown で呼ぶ。端では止まる（回らない）。

// 押したキーごとの、移る先の項目の番号。
const FOCUS_MOVES: Record<string, (index: number, itemCount: number) => number> = {
  ArrowDown: (index) => index + 1,
  ArrowUp: (index) => index - 1,
  Home: () => 0,
  End: (_index, itemCount) => itemCount - 1,
};

export function hasModifierKey(event: React.KeyboardEvent): boolean {
  return event.altKey || event.ctrlKey || event.metaKey || event.shiftKey;
}

// itemSelector に当たる項目の上で、移すキーを押したら、隣（か端）の項目へフォーカスを移して true を返す。
// 移すキーでない、修飾キーつき、項目の上でないときは何もせず false（既定の動きも止めない）。
export function moveFocusAmongItems(event: React.KeyboardEvent<HTMLElement>, itemSelector: string): boolean {
  const move = FOCUS_MOVES[event.key];
  const item = event.target as HTMLElement;
  if (move === undefined || hasModifierKey(event) || !item.matches(itemSelector)) {
    return false;
  }
  const items = [...event.currentTarget.querySelectorAll<HTMLElement>(itemSelector)];
  const nextIndex = Math.max(0, Math.min(items.length - 1, move(items.indexOf(item), items.length)));
  event.preventDefault();
  items[nextIndex]?.focus();
  return true;
}
