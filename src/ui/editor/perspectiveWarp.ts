// 斜めから撮った書類の四隅を、長方形に引き伸ばす（射影変換）。書類のスキャンで、傾きを直すのに使う。
// 画面や canvas に頼らない計算だけを置く。

export type Point = { x: number; y: number };
// 書類の四隅。左上、右上、右下、左下の順。
export type Quad = [Point, Point, Point, Point];
// 画素の並び（canvas の ImageData と同じ形。1 画素は赤・緑・青・不透明度の 4 つ）。
export type PixelGrid = { data: Uint8ClampedArray; width: number; height: number };

const CHANNELS_PER_PIXEL = 4;

const distance = (from: Point, to: Point) => Math.hypot(to.x - from.x, to.y - from.y);

// 傾きを直したあとの大きさ。向かい合う辺の、長い方に合わせる。
export function straightenedSize([topLeft, topRight, bottomRight, bottomLeft]: Quad): { width: number; height: number } {
  return {
    width: Math.max(1, Math.round(Math.max(distance(topLeft, topRight), distance(bottomLeft, bottomRight)))),
    height: Math.max(1, Math.round(Math.max(distance(topLeft, bottomLeft), distance(topRight, bottomRight)))),
  };
}

// 長方形の中の位置（横と縦を 0〜1 で表す）を、四隅の中の位置へ写す関数を作る。
function unitSquareToQuad([topLeft, topRight, bottomRight, bottomLeft]: Quad): (u: number, v: number) => Point {
  const deltaX1 = topRight.x - bottomRight.x;
  const deltaX2 = bottomLeft.x - bottomRight.x;
  const deltaX3 = topLeft.x - topRight.x + bottomRight.x - bottomLeft.x;
  const deltaY1 = topRight.y - bottomRight.y;
  const deltaY2 = bottomLeft.y - bottomRight.y;
  const deltaY3 = topLeft.y - topRight.y + bottomRight.y - bottomLeft.y;
  const denominator = deltaX1 * deltaY2 - deltaX2 * deltaY1;
  // 四隅が 1 本の線に並ぶと、割る数が 0 になる。そのときは遠近を付けない（平行四辺形として写す）。
  const perspectiveU = denominator === 0 ? 0 : (deltaX3 * deltaY2 - deltaX2 * deltaY3) / denominator;
  const perspectiveV = denominator === 0 ? 0 : (deltaX1 * deltaY3 - deltaX3 * deltaY1) / denominator;
  const xFromU = topRight.x - topLeft.x + perspectiveU * topRight.x;
  const xFromV = bottomLeft.x - topLeft.x + perspectiveV * bottomLeft.x;
  const yFromU = topRight.y - topLeft.y + perspectiveU * topRight.y;
  const yFromV = bottomLeft.y - topLeft.y + perspectiveV * bottomLeft.y;
  return (u, v) => {
    const scale = perspectiveU * u + perspectiveV * v + 1;
    return { x: (xFromU * u + xFromV * v + topLeft.x) / scale, y: (yFromU * u + yFromV * v + topLeft.y) / scale };
  };
}

// 元の画像の、四隅で囲んだ所を、size の大きさの長方形に引き伸ばす。色は、まわりの 4 画素から割合で混ぜる。
export function warpQuadToRectangle(source: PixelGrid, quad: Quad, size: { width: number; height: number }): PixelGrid {
  const toSource = unitSquareToQuad(quad);
  const data = new Uint8ClampedArray(size.width * size.height * CHANNELS_PER_PIXEL);
  const clampX = (x: number) => Math.min(Math.max(x, 0), source.width - 1);
  const clampY = (y: number) => Math.min(Math.max(y, 0), source.height - 1);
  for (let row = 0; row < size.height; row += 1) {
    for (let column = 0; column < size.width; column += 1) {
      // 画素の中心を写す。1 画素しか無い辺は、その真ん中を取る。
      const point = toSource(size.width === 1 ? 0.5 : column / (size.width - 1), size.height === 1 ? 0.5 : row / (size.height - 1));
      const left = Math.floor(clampX(point.x));
      const top = Math.floor(clampY(point.y));
      const right = clampX(left + 1);
      const bottom = clampY(top + 1);
      const rightWeight = clampX(point.x) - left;
      const bottomWeight = clampY(point.y) - top;
      const target = (row * size.width + column) * CHANNELS_PER_PIXEL;
      for (let channel = 0; channel < CHANNELS_PER_PIXEL; channel += 1) {
        const at = (x: number, y: number) => source.data[(y * source.width + x) * CHANNELS_PER_PIXEL + channel] ?? 0;
        const upper = at(left, top) * (1 - rightWeight) + at(right, top) * rightWeight;
        const lower = at(left, bottom) * (1 - rightWeight) + at(right, bottom) * rightWeight;
        data[target + channel] = upper * (1 - bottomWeight) + lower * bottomWeight;
      }
    }
  }
  return { data, width: size.width, height: size.height };
}
