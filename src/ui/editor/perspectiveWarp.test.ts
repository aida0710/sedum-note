import { describe, expect, it } from "vitest";
import { type PixelGrid, type Quad, straightenedSize, warpQuadToRectangle } from "./perspectiveWarp";

// 横 width・縦 height の画像。画素の赤に横の位置、緑に縦の位置を入れる（どこから取った色かが分かる）。
function positionImage(width: number, height: number): PixelGrid {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      data.set([x, y, 0, 255], (y * width + x) * 4);
    }
  }
  return { data, width, height };
}

const pixelAt = (image: PixelGrid, x: number, y: number) => [...image.data.slice((y * image.width + x) * 4, (y * image.width + x) * 4 + 2)];

describe("書類の四隅を長方形に引き伸ばす", () => {
  it("画像の四隅をそのまま指すと、同じ画像になる", () => {
    const source = positionImage(5, 4);
    const whole: Quad = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }, { x: 0, y: 3 }];
    expect(straightenedSize(whole)).toEqual({ width: 4, height: 3 });
    const warped = warpQuadToRectangle(source, whole, { width: 5, height: 4 });
    expect([...warped.data]).toEqual([...source.data]);
  });

  it("画像の中の長方形を指すと、その中だけを切り出す", () => {
    const source = positionImage(20, 20);
    const inner: Quad = [{ x: 5, y: 10 }, { x: 15, y: 10 }, { x: 15, y: 14 }, { x: 5, y: 14 }];
    const warped = warpQuadToRectangle(source, inner, { width: 11, height: 5 });
    expect(pixelAt(warped, 0, 0)).toEqual([5, 10]);
    expect(pixelAt(warped, 10, 4)).toEqual([15, 14]);
    expect(pixelAt(warped, 5, 2)).toEqual([10, 12]);
  });

  it("台形（斜めから撮った書類）を指すと、四隅が長方形の四隅に来る", () => {
    const source = positionImage(40, 40);
    const trapezoid: Quad = [{ x: 10, y: 5 }, { x: 30, y: 5 }, { x: 38, y: 35 }, { x: 2, y: 35 }];
    const size = straightenedSize(trapezoid);
    expect(size.width).toBe(36);
    const warped = warpQuadToRectangle(source, trapezoid, size);
    expect(pixelAt(warped, 0, 0)).toEqual([10, 5]);
    expect(pixelAt(warped, size.width - 1, 0)).toEqual([30, 5]);
    expect(pixelAt(warped, size.width - 1, size.height - 1)).toEqual([38, 35]);
    expect(pixelAt(warped, 0, size.height - 1)).toEqual([2, 35]);
    // 上の辺の真ん中は、元の上の辺の真ん中（遠近を直しているので、横の位置は 20）。
    expect(pixelAt(warped, (size.width - 1) / 2 | 0, 0)[1]).toBe(5);
  });
});
