// スマホの一覧のメモを、横にスワイプして操作する（左へ払うとゴミ箱、右へ払うとピン留め）。
//   指が触れている間は、行が指にそのまま付いて動く（React の描画を通さず、transform を直接書く）。
//   縦に動かし始めたら一覧のスクロールに任せ、横に動かし始めたときだけ行を動かす。
//   離したら、動かした距離か払った速さで、操作を行うか元に戻すかを決める（swipeOutcome.ts）。
//   離せば操作を行う距離を越えた瞬間に、短く振動させる（Android のアプリだけ。速く払って決まるときは振動しない）。
// 押した向きの下に出す色と文字は、行の data-swipe で CSS が切り替える。

import { useRef } from "react";
import { giveHapticFeedback } from "../platform/hapticFeedback";
import { isPastCommitDistance, RUBBER_BAND_FACTOR, type SwipeDirection, swipeOutcome } from "./swipeOutcome";

// 縦か横かを決めるまでに待つ、指の動きの距離（px）。
const AXIS_LOCK_DISTANCE = 8;
// 払った速さを、直近の動きにどれだけ寄せて求めるか（大きいほど直近に寄る）。
const VELOCITY_SMOOTHING = 0.6;

type SwipeActions = { onSwipeLeft?: () => void; onSwipeRight?: () => void };

type SwipeGesture = {
  pointerId: number;
  startX: number;
  startY: number;
  axis: "x" | "y" | null;
  offset: number;
  lastX: number;
  lastTime: number;
  // px/ms。左へ動いているときは負。
  velocity: number;
  // 離せば操作を行う距離を越えているか。越えた瞬間だけ振動させるために覚える。
  pastCommitDistance: boolean;
};

export function useSwipeActions({ onSwipeLeft, onSwipeRight }: SwipeActions) {
  const rowRef = useRef<HTMLDivElement>(null);
  const itemRef = useRef<HTMLButtonElement>(null);
  const gesture = useRef<SwipeGesture | null>(null);
  // スワイプのあとに届く click で、メモを開かないようにする。
  const swipedJustNow = useRef(false);

  const moveItem = (offset: number, { animated }: { animated: boolean }) => {
    const item = itemRef.current;
    if (!item) {
      return;
    }
    // 指に付いて動く間は、CSS の transition を止める（遅れて付いてくると、指から離れて見える）。
    item.style.transition = animated ? "" : "none";
    item.style.transform = offset === 0 ? "" : `translateX(${offset}px)`;
    const direction: SwipeDirection | null = offset < 0 ? "left" : offset > 0 ? "right" : null;
    if (direction === null) {
      rowRef.current?.removeAttribute("data-swipe");
    } else {
      rowRef.current?.setAttribute("data-swipe", direction);
    }
  };

  const actionFor = (direction: SwipeDirection) => (direction === "left" ? onSwipeLeft : onSwipeRight);

  const handlers = {
    onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => {
      swipedJustNow.current = false;
      if (event.button !== 0) {
        return;
      }
      gesture.current = {
        pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, axis: null,
        offset: 0, lastX: event.clientX, lastTime: event.timeStamp, velocity: 0, pastCommitDistance: false,
      };
    },
    onPointerMove: (event: React.PointerEvent<HTMLButtonElement>) => {
      const current = gesture.current;
      if (current === null || current.pointerId !== event.pointerId) {
        return;
      }
      const deltaX = event.clientX - current.startX;
      if (current.axis === null) {
        const deltaY = event.clientY - current.startY;
        if (Math.max(Math.abs(deltaX), Math.abs(deltaY)) < AXIS_LOCK_DISTANCE) {
          return;
        }
        current.axis = Math.abs(deltaX) > Math.abs(deltaY) ? "x" : "y";
        if (current.axis === "x") {
          event.currentTarget.setPointerCapture(event.pointerId);
        }
      }
      if (current.axis !== "x") {
        return;
      }
      const elapsed = Math.max(1, event.timeStamp - current.lastTime);
      const instantVelocity = (event.clientX - current.lastX) / elapsed;
      current.velocity = current.velocity * (1 - VELOCITY_SMOOTHING) + instantVelocity * VELOCITY_SMOOTHING;
      current.lastX = event.clientX;
      current.lastTime = event.timeStamp;
      const hasAction = actionFor(deltaX < 0 ? "left" : "right") !== undefined;
      current.offset = hasAction ? deltaX : deltaX * RUBBER_BAND_FACTOR;
      moveItem(current.offset, { animated: false });
      const pastCommitDistance = hasAction && isPastCommitDistance({ offset: current.offset, width: event.currentTarget.offsetWidth });
      if (pastCommitDistance && !current.pastCommitDistance) {
        giveHapticFeedback();
      }
      current.pastCommitDistance = pastCommitDistance;
    },
    onPointerUp: (event: React.PointerEvent<HTMLButtonElement>) => {
      const current = gesture.current;
      gesture.current = null;
      if (current === null || current.pointerId !== event.pointerId || current.axis !== "x") {
        return;
      }
      swipedJustNow.current = true;
      const width = event.currentTarget.offsetWidth;
      const direction = swipeOutcome({ offset: current.offset, velocity: current.velocity, width });
      const action = direction === null ? undefined : actionFor(direction);
      if (direction === "left" && action) {
        // 行を払った向きへ送り出してから、ゴミ箱に入れる（一覧から消えるのは、そのあと）。
        moveItem(-width, { animated: true });
      } else {
        moveItem(0, { animated: true });
      }
      action?.();
    },
    onPointerCancel: () => {
      gesture.current = null;
      moveItem(0, { animated: true });
    },
    onClickCapture: (event: React.MouseEvent) => {
      if (swipedJustNow.current) {
        swipedJustNow.current = false;
        event.preventDefault();
        event.stopPropagation();
      }
    },
  };
  return { rowRef, itemRef, handlers };
}
