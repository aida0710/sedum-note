// 本文の上に並べる、メモのタグのチップ。タグが多いメモでは、最初の何個かだけを出し、残りは「+N」のチップにまとめる
// （押すと全部を出す）。全部を並べると、題が画面の下まで押し下げられる。

import { useState } from "react";
import { translate } from "../i18n/translate";

// まとめずに出すタグの数。本文の上の 1 行に収まるくらい。
const MAX_TAGS_SHOWN = 5;

export function NoteTagChips({ tags }: { tags: string[] }) {
  const [showsAll, setShowsAll] = useState(false);
  const hiddenCount = tags.length - MAX_TAGS_SHOWN;
  const shownTags = showsAll || hiddenCount <= 0 ? tags : tags.slice(0, MAX_TAGS_SHOWN);
  return (
    <>
      {shownTags.map((tag) => <span key={tag} className="chip"><span className="chip-label">#{tag}</span></span>)}
      {hiddenCount > 0 && (
        <button type="button" className="chip more-tags" aria-expanded={showsAll} onClick={() => setShowsAll(!showsAll)}
          aria-label={translate(showsAll ? "editor.showFewerTags" : "editor.showMoreTags", { count: hiddenCount })}>
          {showsAll ? translate("editor.showFewerTags") : `+${hiddenCount}`}
        </button>
      )}
    </>
  );
}
