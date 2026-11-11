// ファイルの大きさを、画面に出す形にする（1.2 MB、340 KB など）。

const UNITS = ["B", "KB", "MB", "GB"] as const;
const UNIT_STEP = 1024;

export function formatByteSize(byteLength: number): string {
  let value = byteLength;
  let unitIndex = 0;
  while (value >= UNIT_STEP && unitIndex < UNITS.length - 1) {
    value /= UNIT_STEP;
    unitIndex += 1;
  }
  const digits = unitIndex === 0 || value >= 100 ? 0 : 1;
  return `${value.toFixed(digits)} ${UNITS[unitIndex]}`;
}
