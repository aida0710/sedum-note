// ロックを解除している画面で、操作が無いときの自動のロック（inactivityLock.ts）を動かす hook。このウィンドウのキー・マウス・
// タッチ・スクロールを操作として共有の時刻に書き、画面に戻ったとき（visibilitychange・focus）にも時間が過ぎていないかを見る。
// ロックの画面・最初の画面では呼ばない（解除している画面の部品だけが呼ぶ）。

import { useEffect, useRef } from "react";
import { readLastActivityTime, writeLastActivityTime } from "../platform/lastActivityTime";
import { useDevicePreferences } from "../preferences/devicePreferences";
import { InactivityLock } from "./inactivityLock";

const MILLISECONDS_PER_MINUTE = 60_000;

// 操作として数える出来事。スクロールは要素の上でも起きるので、window で捕まえる（capture）。
const ACTIVITY_EVENTS = ["keydown", "pointerdown", "pointermove", "wheel", "touchstart", "scroll"] as const;

// lock は、保存を待っている入力を書いてからロックする（VaultSession.lock）。
export function useInactivityLock(lock: () => Promise<void>): void {
  const { inactivityLockMinutes } = useDevicePreferences();
  // lock は描くたびに作り直されるので、最新のものを ref で持つ（作り直すたびに数え直さない）。
  const lockRef = useRef(lock);
  lockRef.current = lock;
  useEffect(() => {
    if (inactivityLockMinutes === null) {
      return;
    }
    const inactivityLock = new InactivityLock({
      timeoutMs: inactivityLockMinutes * MILLISECONDS_PER_MINUTE,
      now: () => Date.now(),
      readLastActivityTime,
      writeLastActivityTime,
      lock: () => void lockRef.current(),
    });
    inactivityLock.start();
    const noteActivity = () => inactivityLock.noteActivity();
    const checkWhenShown = () => {
      if (document.visibilityState === "visible") {
        inactivityLock.check();
      }
    };
    const listenerOptions = { capture: true, passive: true };
    for (const type of ACTIVITY_EVENTS) {
      window.addEventListener(type, noteActivity, listenerOptions);
    }
    document.addEventListener("visibilitychange", checkWhenShown);
    window.addEventListener("focus", checkWhenShown);
    return () => {
      inactivityLock.stop();
      for (const type of ACTIVITY_EVENTS) {
        window.removeEventListener(type, noteActivity, listenerOptions);
      }
      document.removeEventListener("visibilitychange", checkWhenShown);
      window.removeEventListener("focus", checkWhenShown);
    };
  }, [inactivityLockMinutes]);
}
