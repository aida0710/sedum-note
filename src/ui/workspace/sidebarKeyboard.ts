// 左の列の一覧を、キーボードで動く操作。
//   ↑ ↓ で前後の行へ、Home と End で最初と最後の行へ移る（開いた一覧の中のメモも 1 行に数える）。
//   一覧の行で → を押すと開き、← を押すと閉じる。メモの行で ← を押すと、そのメモが並ぶ一覧の行へ戻る。
//   Enter はボタンの既定の動き（一覧を選ぶ・メモを開く）に任せる。

// キーで移る行。一覧の行（.nav。保存した検索の行も含む）と、メモの行。
const TREE_ROW_SELECTOR = "button.nav, button.tree-note";

// 押したキーごとの、移る先の行の番号。
const ROW_MOVES: Record<string, (index: number, rowCount: number) => number> = {
  ArrowDown: (index) => index + 1,
  ArrowUp: (index) => index - 1,
  Home: () => 0,
  End: (_index, rowCount) => rowCount - 1,
};

function hasModifier(event: React.KeyboardEvent): boolean {
  return event.altKey || event.ctrlKey || event.metaKey || event.shiftKey;
}

function treeRows(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>(TREE_ROW_SELECTOR)];
}

// 左の列の一覧（.sidebar-scroll）が受ける。行の上で ↑ ↓ Home End を押したら、行の間を移る。
export function moveFocusBetweenRows(event: React.KeyboardEvent<HTMLElement>): void {
  const move = ROW_MOVES[event.key];
  const row = event.target as HTMLElement;
  if (move === undefined || hasModifier(event) || !row.matches(TREE_ROW_SELECTOR)) {
    return;
  }
  const rows = treeRows(event.currentTarget);
  const nextIndex = Math.max(0, Math.min(rows.length - 1, move(rows.indexOf(row), rows.length)));
  event.preventDefault();
  rows[nextIndex]?.focus();
}

type ViewRowKeys = { expanded: boolean; setExpanded: (expanded: boolean) => void };

// 一覧の行が受ける。→ で開き（開いていれば中の最初の行へ）、← で閉じる。
export function expandOrCollapseViewRow(event: React.KeyboardEvent<HTMLElement>, { expanded, setExpanded }: ViewRowKeys): void {
  if (hasModifier(event) || (event.key !== "ArrowRight" && event.key !== "ArrowLeft")) {
    return;
  }
  event.preventDefault();
  if (event.key === "ArrowLeft") {
    setExpanded(false);
    return;
  }
  if (!expanded) {
    setExpanded(true);
    return;
  }
  const rows = treeRows(event.currentTarget.closest<HTMLElement>(".sidebar-scroll") ?? document.body);
  rows[rows.indexOf(event.currentTarget) + 1]?.focus();
}

// メモの行が受ける。← で、そのメモが並ぶ一覧の行（data-view-key が同じ .nav）へ戻る。
export function focusViewRowOfNote(event: React.KeyboardEvent<HTMLElement>, viewKey: string): void {
  if (hasModifier(event) || event.key !== "ArrowLeft") {
    return;
  }
  const viewRow = event.currentTarget.closest(".sidebar-scroll")?.querySelector<HTMLElement>(`button.nav[data-view-key="${CSS.escape(viewKey)}"]`);
  if (viewRow) {
    event.preventDefault();
    viewRow.focus();
  }
}
