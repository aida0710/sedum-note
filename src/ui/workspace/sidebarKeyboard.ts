// 左の列の一覧を、キーボードで動く操作。
//   ↑ ↓ で前後の行へ、Home と End で最初と最後の行へ移る（開いた一覧の中のメモも 1 行に数える）。
//   一覧の行で → を押すと開き、← を押すと閉じる。メモの行で ← を押すと、そのメモが並ぶ一覧の行へ戻る。
//   Enter はボタンの既定の動き（一覧を選ぶ・メモを開く）に任せる。
//   F2 で名前の変更、メモの行の Delete でゴミ箱へ（行の側が isUnmodifiedKey で受ける）。行を消したら、次の行へフォーカスを移す。
//   メモの行で Shift+↑ ↓ を押すと、同じ一覧の隣のメモへ移りながら、選んだメモを広げる（Shift を押しながら押したときと同じ選択）。
//   英数字のキーを押すと、その文字で名前が始まる次の行へ移る。

import { hasModifierKey, moveFocusAmongItems } from "../shared/arrowKeyFocus";
import { isImeKeyEvent } from "../shared/imeKeyEvent";
import { readNoteSelection, resetNoteSelection, selectNoteRange } from "./noteSelection";

// キーで移る行。一覧の行（.nav。保存した検索の行も含む）と、メモの行。
const TREE_ROW_SELECTOR = "button.nav, button.tree-note";

// 修飾キーなしで key を押したか。
export function isUnmodifiedKey(event: React.KeyboardEvent, key: string): boolean {
  return event.key === key && !hasModifierKey(event);
}

// メモの行を消したあと（ゴミ箱に入れる、完全に削除する）にフォーカスを移す先。次の行で、無ければ前の行。
// 行が画面から消える前（消す操作の前）に呼ぶ。これから消すメモの行（data-note-id。同じメモは複数の一覧に並ぶ）は選ばない。
export function rowBesideNotesToRemove(row: HTMLElement, noteIdsToRemove: string[]): HTMLElement | undefined {
  const rows = treeRows(row.closest<HTMLElement>(".sidebar-scroll") ?? document.body);
  const index = rows.indexOf(row);
  const remains = (candidate: HTMLElement) => candidate.dataset.noteId === undefined || !noteIdsToRemove.includes(candidate.dataset.noteId);
  return rows.slice(index + 1).find(remains) ?? rows.slice(0, index).reverse().find(remains);
}

function treeRows(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>(TREE_ROW_SELECTOR)];
}

// 左の列の一覧（.sidebar-scroll）が受ける。行の上で ↑ ↓ Home End を押したら行の間を移り、英数字を押したらその文字で始まる行へ移る。
export function moveFocusBetweenRows(event: React.KeyboardEvent<HTMLElement>): void {
  if (!moveFocusAmongItems(event, TREE_ROW_SELECTOR)) {
    focusRowByFirstCharacter(event);
  }
}

// 押した文字で名前（行の title）が始まる行のうち、今の行の次から数えて最初の行へ移る（最後まで無ければ先頭から探す）。
function focusRowByFirstCharacter(event: React.KeyboardEvent<HTMLElement>): void {
  const row = event.target as HTMLElement;
  const isCharacterKey = event.key.length === 1 && event.key.trim() !== "";
  if (!isCharacterKey || event.altKey || event.ctrlKey || event.metaKey || isImeKeyEvent(event.nativeEvent) || !row.matches(TREE_ROW_SELECTOR)) {
    return;
  }
  const character = event.key.toLocaleLowerCase();
  const rows = treeRows(event.currentTarget);
  const index = rows.indexOf(row);
  const target = [...rows.slice(index + 1), ...rows.slice(0, index)].find((candidate) => candidate.title.toLocaleLowerCase().startsWith(character));
  if (target) {
    event.preventDefault();
    target.focus();
  }
}

type NoteRowInList = { noteId: string; listedNoteIds: string[] };

// メモの行が受ける。Shift+↑ ↓ で同じ一覧の隣のメモの行へ移り、選び始めた行（起点）から移った先までを選ぶ。
// 何も選んでいないとき（か、起点がこの一覧に無いとき）は、今の行を起点にする。
export function extendNoteSelectionByKey(event: React.KeyboardEvent<HTMLElement>, { noteId, listedNoteIds }: NoteRowInList): void {
  const step = event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0;
  if (step === 0 || !event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) {
    return;
  }
  event.preventDefault();
  const nextNoteId = listedNoteIds[listedNoteIds.indexOf(noteId) + step];
  if (nextNoteId === undefined) {
    return;
  }
  const { noteIds, anchorId } = readNoteSelection();
  if (noteIds.length === 0 || anchorId === null || !listedNoteIds.includes(anchorId)) {
    resetNoteSelection(noteId);
  }
  selectNoteRange(nextNoteId, { orderedIds: listedNoteIds, openNoteId: null });
  // 同じメモはほかの一覧にも並ぶので、この行の隣の行（同じ一覧）へ移る。
  const row = event.currentTarget.closest(".nav-row");
  const neighborRow = step > 0 ? row?.nextElementSibling : row?.previousElementSibling;
  neighborRow?.querySelector<HTMLElement>(`button.tree-note[data-note-id="${CSS.escape(nextNoteId)}"]`)?.focus();
}

type ViewRowKeys = { expanded: boolean; setExpanded: (expanded: boolean) => void };

// 一覧の行が受ける。→ で開き（開いていれば中の最初の行へ）、← で閉じる。
export function expandOrCollapseViewRow(event: React.KeyboardEvent<HTMLElement>, { expanded, setExpanded }: ViewRowKeys): void {
  if (hasModifierKey(event) || (event.key !== "ArrowRight" && event.key !== "ArrowLeft")) {
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
  if (hasModifierKey(event) || event.key !== "ArrowLeft") {
    return;
  }
  const viewRow = event.currentTarget.closest(".sidebar-scroll")?.querySelector<HTMLElement>(`button.nav[data-view-key="${CSS.escape(viewKey)}"]`);
  if (viewRow) {
    event.preventDefault();
    viewRow.focus();
  }
}
