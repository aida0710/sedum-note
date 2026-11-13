// ズームしているときに左上に出す、戻るボタン。押すと 1 つ上の階層へ戻り、いちばん上ならズームをやめてメモ全体を出す。
// 戻り先の名前（上の項目・見出しの文字、いちばん上ならメモの題）を添える。

import { type Editor, useEditorState } from "@tiptap/react";
import { ChevronLeft } from "lucide-react";
import { translate } from "../i18n/translate";
import { zoomedItemPosition, zoomOutOneLevel, zoomPath } from "./zoom";

// エディタがズームしているか。ズームの出入りのときだけ描き直す。
export function useIsZoomed(editor: Editor | null): boolean {
  return useEditorState({ editor, selector: ({ editor: current }) => current !== null && zoomedItemPosition(current.state) !== null }) ?? false;
}

type ZoomBackButtonProps = { editor: Editor; noteTitle: string; className: string };

export function ZoomBackButton({ editor, noteTitle, className }: ZoomBackButtonProps) {
  // 戻り先の名前だけを見て、変わったときだけ描き直す。
  const destination = useEditorState({
    editor,
    selector: ({ editor: current }) => {
      const path = zoomPath(current.state);
      const parent = path[path.length - 2];
      return parent ? parent.text || translate("editor.zoomEmptyItem") : noteTitle || translate("editor.zoomWholeNote");
    },
  });
  return (
    <button type="button" className={className} aria-label={translate("editor.zoomBackTo", { name: destination })}
      title={translate("editor.zoomBackTo", { name: destination })} onClick={() => zoomOutOneLevel(editor)}>
      <ChevronLeft size={20} />
      <span>{destination}</span>
    </button>
  );
}
