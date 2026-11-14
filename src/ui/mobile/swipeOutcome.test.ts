import { describe, expect, it } from "vitest";
import { isPastCommitDistance, swipeOutcome } from "./swipeOutcome";

const WIDTH = 390;

describe("スワイプして離したときの操作", () => {
  it("行の幅の 35% より多く動かして離すと、動かした向きの操作を行う", () => {
    expect(swipeOutcome({ offset: -150, velocity: 0, width: WIDTH })).toBe("left");
    expect(swipeOutcome({ offset: 150, velocity: 0, width: WIDTH })).toBe("right");
    expect(swipeOutcome({ offset: -100, velocity: 0, width: WIDTH })).toBeNull();
  });

  it("速く払えば、動かした距離が短くても操作を行う。ただし指が触れた程度の揺れでは行わない", () => {
    expect(swipeOutcome({ offset: -40, velocity: -0.8, width: WIDTH })).toBe("left");
    expect(swipeOutcome({ offset: -10, velocity: -0.8, width: WIDTH })).toBeNull();
  });

  it("動かした向きと逆へ払って戻したら、操作を行わない", () => {
    expect(swipeOutcome({ offset: -60, velocity: 0.8, width: WIDTH })).toBeNull();
  });

  it("離せば操作を行う距離を越えたかは、速さを見ずに、動かした距離だけで決まる（指を動かしている間に振動させる所）", () => {
    expect(isPastCommitDistance({ offset: -150, width: WIDTH })).toBe(true);
    expect(isPastCommitDistance({ offset: 150, width: WIDTH })).toBe(true);
    expect(isPastCommitDistance({ offset: -100, width: WIDTH })).toBe(false);
    expect(isPastCommitDistance({ offset: 0, width: WIDTH })).toBe(false);
  });
});
