// 箇条書きの項目にズームしているときに本文の上に出す、パンくず。上の階層の項目か「全体」を押すと、そこへ戻る。

import { type Editor, useEditorState } from "@tiptap/react";
import { ChevronRight } from "lucide-react";
import { translate } from "../i18n/translate";
import { zoomPath, zoomToItem } from "./listZoom";

export function NoteZoomBar({ editor }: { editor: Editor }) {
  // 道筋は毎回新しい配列になるので、変わったときだけ描き直すよう、文字にして比べる。
  const serializedPath = useEditorState({ editor, selector: ({ editor: current }) => JSON.stringify(zoomPath(current.state)) });
  const path = JSON.parse(serializedPath) as ReturnType<typeof zoomPath>;
  if (path.length === 0) {
    return null;
  }
  return (
    <nav className="zoom-bar" aria-label={translate("editor.zoomPath")}>
      <button type="button" className="text-button" onClick={() => zoomToItem(editor, null)}>{translate("editor.zoomWholeNote")}</button>
      {path.map((entry, index) => (
        <span key={entry.position} className="zoom-bar-entry">
          <ChevronRight size={13} />
          {index === path.length - 1
            ? <span aria-current="location">{entry.text || translate("editor.zoomEmptyItem")}</span>
            : <button type="button" className="text-button" onClick={() => zoomToItem(editor, entry.position)}>{entry.text || translate("editor.zoomEmptyItem")}</button>}
        </span>
      ))}
    </nav>
  );
}
