// 左の列の行の右に出す件数。0 は出さない（全部の行に「0」が並ぶと、数字の縦の列ができて目に付くため）。

export function SidebarCount({ count }: { count: number }) {
  return count === 0 ? null : <span className="count">{count}</span>;
}
