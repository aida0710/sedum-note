// マウスのある高さのブロック（本文の直下のブロックか、箇条書きの項目）の、折りたたみの印と見出しのズームのボタンを出す。
// 要素の :hover だけで出すと、本文の左にある印へマウスを運ぶ途中（ブロックの外や、印と印の隙間）で消えてしまう。
// どのブロックかは、持ち手（blockDragHandle.ts）が本文の列のマウスの動きから決めて、ここへ知らせる。
//
// 印の要素（エディタに渡した飾りの中身で、エディタは中の変更を見ない）にクラスを付けるだけにして、エディタの状態は変えない。
// マウスの動きでエディタの表示を更新すると、押した直後でまだエディタが読んでいない選択が、前の位置へ戻されるため。

// ブロックの要素から見た、そのブロックの印（チェックリストの項目は、印が中身の div の中にある）。
const BLOCK_MARKS_SELECTOR = ":scope > .fold-toggle, :scope > div > .fold-toggle, :scope > .section-zoom";
// 印を出すクラス。CSS（.fold-toggle.shown-for-hovered-block など）と同じ名前。
const SHOWN_CLASS = "shown-for-hovered-block";

export type HoveredBlockMarks = {
  // blockElement の印を出し、前に出していた印は隠す。null なら全部隠す。
  showFor: (blockElement: HTMLElement | null) => void;
};

export function createHoveredBlockMarks(): HoveredBlockMarks {
  let shownMarks: Element[] = [];
  return {
    showFor: (blockElement) => {
      const marks = blockElement ? [...blockElement.querySelectorAll(BLOCK_MARKS_SELECTOR)] : [];
      shownMarks.filter((mark) => !marks.includes(mark)).forEach((mark) => mark.classList.remove(SHOWN_CLASS));
      marks.forEach((mark) => mark.classList.add(SHOWN_CLASS));
      shownMarks = marks;
    },
  };
}
