// 動きを減らす設定（OS の設定の prefers-reduced-motion）。オンなら、画面の中の移動や拡大の動きを付けずに、その場で切り替える。

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

export function prefersReducedMotion(): boolean {
  return window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

// 目次や脚注から本文の位置へ送るときの動き。
export function scrollBehaviorForMotionPreference(): ScrollBehavior {
  return prefersReducedMotion() ? "auto" : "smooth";
}
