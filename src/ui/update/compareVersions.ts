// 「0.2.0」の形のバージョンの比較。先頭の v は無視する。数字でない部分（-beta など）は見ない。

function versionNumbers(version: string): number[] {
  return version.replace(/^v/, "").split(/[-+]/)[0]!.split(".").map((part) => Number.parseInt(part, 10) || 0);
}

// left が right より新しければ正、古ければ負、同じなら 0。
export function compareVersions(left: string, right: string): number {
  const leftNumbers = versionNumbers(left);
  const rightNumbers = versionNumbers(right);
  for (let index = 0; index < Math.max(leftNumbers.length, rightNumbers.length); index += 1) {
    const difference = (leftNumbers[index] ?? 0) - (rightNumbers[index] ?? 0);
    if (difference !== 0) {
      return difference;
    }
  }
  return 0;
}
