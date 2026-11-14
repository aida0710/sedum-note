// スマホの一覧のスクロール位置を、一覧ごとに覚えておき、メモを開いて戻ったときに元の位置から続けて読めるようにする。
// メモを開いている間、一覧は画面から外れて作り直されるので、位置をここに持つ（アプリを閉じるまで。保存はしない）。
//
// 位置は scrollTop の数ではなく、「いちばん上に見えていたメモと、一覧の上端からのずれ」で覚える。一覧の行は画面の外では描かず、
// 見積もりの高さで並べる（app.css の content-visibility）ので、作り直した直後の scrollTop は、前と同じ数でも違うメモを指す。

import { type RefObject, useLayoutEffect } from "react";

// 一覧の行に付けておく、メモの ID の属性（MobileNoteList.tsx）。
export const LIST_ROW_NOTE_ID_ATTRIBUTE = "data-note-id";

type ListScrollAnchor = {
  // いちばん上に見えていた行のメモの ID。行が無ければ null。
  noteId: string | null;
  // その行の上端の、一覧の上端からのずれ（px。行が上に切れていれば負）。
  offset: number;
  // 行が見つからないとき（メモが消えた、絞り込みが変わった）に使う位置。
  scrollTop: number;
};

const rememberedAnchors = new Map<string, ListScrollAnchor>();

function topVisibleRow(container: HTMLElement): HTMLElement | null {
  const box = container.getBoundingClientRect();
  // 上端のすぐ下の、一覧の真ん中の所にある行（行のふちの線の上を避ける）。
  const element = document.elementFromPoint(box.left + box.width / 2, box.top + 1);
  const row = element?.closest<HTMLElement>(`[${LIST_ROW_NOTE_ID_ATTRIBUTE}]`) ?? null;
  return row && container.contains(row) ? row : null;
}

function anchorOf(container: HTMLElement): ListScrollAnchor {
  const row = topVisibleRow(container);
  return {
    noteId: row?.getAttribute(LIST_ROW_NOTE_ID_ATTRIBUTE) ?? null,
    offset: row ? row.getBoundingClientRect().top - container.getBoundingClientRect().top : 0,
    scrollTop: container.scrollTop,
  };
}

function restoreAnchor(container: HTMLElement, anchor: ListScrollAnchor): void {
  const row = anchor.noteId === null ? null : container.querySelector<HTMLElement>(`[${LIST_ROW_NOTE_ID_ATTRIBUTE}="${CSS.escape(anchor.noteId)}"]`);
  if (!row) {
    container.scrollTop = anchor.scrollTop;
    return;
  }
  container.scrollTop += row.getBoundingClientRect().top - container.getBoundingClientRect().top - anchor.offset;
}

// listKey は、どの一覧か（下のタブと、開いているノートブック・タグなど）を表す文字。
export function useRememberedListScroll(scrollContainer: RefObject<HTMLElement | null>, listKey: string): void {
  // 描く前に戻す（先頭が一瞬見えてから動くのを防ぐ）。
  useLayoutEffect(() => {
    const container = scrollContainer.current;
    if (!container) {
      return;
    }
    const anchor = rememberedAnchors.get(listKey);
    if (anchor) {
      restoreAnchor(container, anchor);
    }
    const remember = () => rememberedAnchors.set(listKey, anchorOf(container));
    container.addEventListener("scroll", remember, { passive: true });
    return () => {
      container.removeEventListener("scroll", remember);
      // 一覧が外れる直前（メモを開いた、ほかの一覧へ移った）の位置も覚える。scroll の知らせは次の描画で届くので、
      // 送った直後にメモを開くと（遅い端末で起きる）、知らせの前に外れて古い位置が残っていた。
      if (container.isConnected) {
        remember();
      }
    };
  }, [scrollContainer, listKey]);
}
