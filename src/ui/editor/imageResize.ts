// 写真の右下の持ち手をドラッグして、写真の幅を変える。ドラッグの間は画面の幅だけを直接変え、離したときに 1 回だけ
// 本文の属性（width）に書く（動かすたびに書くと、取り消しの段と同期の記録が細かく増えるため）。

import type { PointerEvent as ReactPointerEvent } from "react";

// 写真の幅の、いちばん小さい値（px）。これより小さいと、何の写真か分からなくなる。
const MIN_IMAGE_WIDTH = 80;

type ImageResizeInput = {
  image: HTMLImageElement | null;
  // 決まった幅（px）。本文の幅いっぱいまで広げたときは null（幅を決めず、本文に合わせる）。
  onCommit: (width: number | null) => void;
};

// 持ち手の pointerdown で呼ぶ。
export function startImageResize(event: ReactPointerEvent<HTMLElement>, { image, onCommit }: ImageResizeInput): void {
  const frame = image?.closest<HTMLElement>(".attachment-image");
  // 写真のブロックが入っている列（本文、段組みの段）の幅。これより広くはしない。
  const columnWidth = frame?.parentElement?.clientWidth;
  if (!image || !frame || !columnWidth) {
    return;
  }
  // 押しても、エディタに写真を選ばせず、ドラッグで写真を動かす操作も始めさせない。
  event.preventDefault();
  event.stopPropagation();
  const draggableBlock = frame.closest<HTMLElement>("[draggable=true]");
  draggableBlock?.setAttribute("draggable", "false");
  frame.classList.add("sized");
  const startX = event.clientX;
  const startWidth = image.getBoundingClientRect().width;
  let width = startWidth;
  // 写真は列の中央に置くので、右の端を指に合わせるには、動かした分の 2 倍だけ幅を変える。
  const resize = (moveEvent: PointerEvent) => {
    width = Math.min(Math.max(startWidth + (moveEvent.clientX - startX) * 2, MIN_IMAGE_WIDTH), columnWidth);
    image.style.width = `${width}px`;
  };
  // 指はすぐに小さな持ち手の外へ出るので、動きと離したことは画面全体で受ける。
  const finish = () => {
    window.removeEventListener("pointermove", resize);
    window.removeEventListener("pointerup", finish);
    window.removeEventListener("pointercancel", finish);
    draggableBlock?.setAttribute("draggable", "true");
    onCommit(width >= columnWidth - 1 ? null : Math.round(width));
  };
  window.addEventListener("pointermove", resize);
  window.addEventListener("pointerup", finish);
  window.addEventListener("pointercancel", finish);
}
