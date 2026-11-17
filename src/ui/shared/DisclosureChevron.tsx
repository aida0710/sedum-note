// 開閉の行（details の summary）の先頭に置く印。ブラウザの三角（▶）は、ほかの開閉の印（サイドバーなどの lucide の山形）と
// そろわないので CSS で消し、これを出す。開いたら下向きにする（app.css の .disclosure-chevron）。

import { ChevronRight } from "lucide-react";
import { ICON_SIZE } from "./iconSizes";

export function DisclosureChevron() {
  return <ChevronRight className="disclosure-chevron" size={ICON_SIZE.row} aria-hidden="true" />;
}
