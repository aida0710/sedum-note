// スマホの一覧のメモを横にスワイプして離したときに、操作を行うかどうかの決まり。
// 指の動き（useSwipeActions.ts）から切り離して、数だけで決める。

// 行の幅に対して、これより多く動かして離したら操作を行う。
const COMMIT_FRACTION = 0.35;
// これより速く払ったら、動かした距離が短くても操作を行う（px/ms）。
const FLICK_VELOCITY = 0.5;
// 払ったと見なす最短の距離。指が触れたときの小さな揺れで操作しないように。
const FLICK_MIN_DISTANCE = 24;
// 操作の無い向きへ引いたときに、指の動きに対して行が動く割合（端で止まらず、重く動く）。
export const RUBBER_BAND_FACTOR = 0.2;

export type SwipeDirection = "left" | "right";

type SwipeRelease = { offset: number; velocity: number; width: number };

// 離したときに操作を行う向き。行わないなら null。払った向きと動かした向きが逆なら、行わない。
export function swipeOutcome({ offset, velocity, width }: SwipeRelease): SwipeDirection | null {
  const direction: SwipeDirection = offset < 0 ? "left" : "right";
  const distance = Math.abs(offset);
  const flickedSameWay = Math.sign(velocity) === Math.sign(offset) && Math.abs(velocity) >= FLICK_VELOCITY;
  if (distance >= width * COMMIT_FRACTION || (flickedSameWay && distance >= FLICK_MIN_DISTANCE)) {
    return offset === 0 ? null : direction;
  }
  return null;
}
