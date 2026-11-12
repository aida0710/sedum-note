// スマホの一覧を、いちばん上から下へ引いて離すと同期する（同期先があるときだけ）。
//   引いている間は、一覧が指の半分の速さで下がり、上に案内が出る（React の描画を通さず、transform を直接書く）。
//   決めた幅より引いて離すと同期し、終わるまで案内を残す。
// ポインターのイベントでは、ブラウザが縦のスクロールを始めると指の動きが届かなくなるので、タッチのイベントで受け、
// 引いている間だけスクロール（とブラウザ自身の引いて再読み込み）を止める。

import { useEffect, useRef, useState } from "react";

// 離すと同期する、一覧を下げた幅（px）。
const PULL_THRESHOLD = 64;
// 指の動きに対して一覧が動く割合。重く引ける手応えにする。
const PULL_RESISTANCE = 0.5;
// 同期している間、案内を見せておくために一覧を下げておく幅（px）。
const SYNCING_OFFSET = 44;
// 下へ引いたと決めるまでに待つ、指の動きの距離（px）。横のスワイプと分けるため。
const PULL_LOCK_DISTANCE = 8;

export type PullState = "idle" | "pulling" | "ready" | "syncing";

type PullGesture = { startX: number; startY: number; pulling: boolean; offset: number };

export function usePullToSync(onSync: (() => Promise<void>) | null) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const indicatorRef = useRef<HTMLDivElement>(null);
  const [pullState, setPullState] = useState<PullState>("idle");
  const onSyncRef = useRef(onSync);
  onSyncRef.current = onSync;
  const enabled = onSync !== null;

  useEffect(() => {
    const scroll = scrollRef.current;
    if (!enabled || !scroll) {
      return;
    }
    let gesture: PullGesture | null = null;
    let syncing = false;
    const moveList = (offset: number, { animated }: { animated: boolean }) => {
      scroll.style.transition = animated ? "" : "none";
      scroll.style.transform = offset === 0 ? "" : `translateY(${offset}px)`;
      const indicator = indicatorRef.current;
      if (indicator) {
        indicator.style.transition = animated ? "" : "none";
        indicator.style.opacity = String(Math.min(1, offset / PULL_THRESHOLD));
        indicator.style.setProperty("--pull-progress", String(Math.min(1, offset / PULL_THRESHOLD)));
      }
    };
    const onTouchStart = (event: TouchEvent) => {
      const touch = event.touches[0];
      gesture = !syncing && event.touches.length === 1 && touch && scroll.scrollTop <= 0
        ? { startX: touch.clientX, startY: touch.clientY, pulling: false, offset: 0 }
        : null;
    };
    const onTouchMove = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (gesture === null || !touch) {
        return;
      }
      const deltaY = touch.clientY - gesture.startY;
      if (!gesture.pulling) {
        const deltaX = touch.clientX - gesture.startX;
        if (Math.max(Math.abs(deltaX), Math.abs(deltaY)) < PULL_LOCK_DISTANCE) {
          return;
        }
        // 上へのスクロールや横のスワイプなら、この指では引かない。
        if (deltaY <= Math.abs(deltaX) || scroll.scrollTop > 0) {
          gesture = null;
          return;
        }
        gesture.pulling = true;
      }
      event.preventDefault();
      gesture.offset = Math.max(0, deltaY * PULL_RESISTANCE);
      moveList(gesture.offset, { animated: false });
      setPullState(gesture.offset >= PULL_THRESHOLD ? "ready" : "pulling");
    };
    // 指を離したら（canceled なら、ブラウザに指を取られたら）引くのを終える。取られたときは同期しない。
    const finishPull = ({ canceled }: { canceled: boolean }) => {
      const released = gesture;
      gesture = null;
      if (released === null || !released.pulling) {
        return;
      }
      const sync = onSyncRef.current;
      if (canceled || released.offset < PULL_THRESHOLD || sync === null) {
        moveList(0, { animated: true });
        setPullState("idle");
        return;
      }
      syncing = true;
      moveList(SYNCING_OFFSET, { animated: true });
      if (indicatorRef.current) {
        indicatorRef.current.style.opacity = "1";
      }
      setPullState("syncing");
      // 同期の失敗は、左下と設定の同期の状態に出る。ここでは案内を閉じるだけにする。
      void sync().catch(() => undefined).finally(() => {
        syncing = false;
        moveList(0, { animated: true });
        setPullState("idle");
      });
    };
    const onTouchEnd = () => finishPull({ canceled: false });
    const onTouchCancel = () => finishPull({ canceled: true });
    scroll.addEventListener("touchstart", onTouchStart, { passive: true });
    // 引いている間はスクロールを止めるので、passive にしない。
    scroll.addEventListener("touchmove", onTouchMove, { passive: false });
    scroll.addEventListener("touchend", onTouchEnd);
    scroll.addEventListener("touchcancel", onTouchCancel);
    return () => {
      scroll.removeEventListener("touchstart", onTouchStart);
      scroll.removeEventListener("touchmove", onTouchMove);
      scroll.removeEventListener("touchend", onTouchEnd);
      scroll.removeEventListener("touchcancel", onTouchCancel);
    };
  }, [enabled]);

  return { scrollRef, indicatorRef, pullState };
}
