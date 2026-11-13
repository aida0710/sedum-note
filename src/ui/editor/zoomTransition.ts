// ズームに入る・戻る・階層を移るときに、本文を短く動かして、表示が切り替わったことを見せる。
// 入るときは少し小さい所から、戻るときは少し大きい所から、元の大きさへ寄せる（近づく・離れる見え方）。
// 動きを減らす設定（prefers-reduced-motion）では動かさない。

import type { Editor } from "@tiptap/react";
import { type RefObject, useEffect } from "react";
import { prefersReducedMotion } from "../shared/reducedMotion";
import { zoomedItemPosition, zoomPath } from "./zoom";

// 切り替わったと分かり、待たされたとは感じない長さ。
const ZOOM_TRANSITION_MILLISECONDS = 180;
const ZOOM_TRANSITION_EASING = "cubic-bezier(0.2, 0, 0, 1)";
// 動き始めの大きさ。大きく動かすと、読んでいた所を見失う。
const ZOOM_IN_START_SCALE = 0.97;
const ZOOM_OUT_START_SCALE = 1.03;

type ZoomTransitionInput = { editor: Editor | null; target: RefObject<HTMLElement | null> };

export function useZoomTransition({ editor, target }: ZoomTransitionInput): void {
  useEffect(() => {
    if (!editor) {
      return;
    }
    let shown = { position: zoomedItemPosition(editor.state), depth: zoomPath(editor.state).length };
    const animateOnZoomChange = ({ transaction }: { transaction: { mapping: { map: (position: number) => number } } }) => {
      const position = zoomedItemPosition(editor.state);
      // 本文を書き換えると、ズームしている項目の位置もずれる。ずれただけなら、ズームは変わっていない。
      const previousPosition = shown.position === null ? null : transaction.mapping.map(shown.position);
      if (position === previousPosition) {
        shown = { ...shown, position };
        return;
      }
      const depth = zoomPath(editor.state).length;
      const zoomedIn = depth > shown.depth;
      shown = { position, depth };
      const element = target.current;
      if (!element || prefersReducedMotion()) {
        return;
      }
      element.animate(
        [{ opacity: 0, transform: `scale(${zoomedIn ? ZOOM_IN_START_SCALE : ZOOM_OUT_START_SCALE})` }, { opacity: 1, transform: "none" }],
        { duration: ZOOM_TRANSITION_MILLISECONDS, easing: ZOOM_TRANSITION_EASING },
      );
    };
    editor.on("transaction", animateOnZoomChange);
    return () => {
      editor.off("transaction", animateOnZoomChange);
    };
  }, [editor, target]);
}
