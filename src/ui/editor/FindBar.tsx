// メモの中の検索の欄。打った言葉に色が付き、Enter で次、Shift+Enter で前の当たりへ移る。

import { type Editor, useEditorState } from "@tiptap/react";
import { ChevronDown, ChevronUp, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { translate } from "../i18n/translate";
import { searchHighlightKey } from "./searchHighlightExtension";

type FindBarProps = {
  editor: Editor;
  // 開くたびに変わる値。変わったら入力欄にカーソルを置く（開いたまま Ctrl+F を押したとき）。
  focusRequest: number;
  onClose: () => void;
};

export function FindBar({ editor, focusRequest, onClose }: FindBarProps) {
  const input = useRef<HTMLInputElement>(null);
  const search = useEditorState({
    editor,
    selector: ({ editor: current }) => {
      const state = searchHighlightKey.getState(current.state);
      return { query: state?.query ?? "", matchCount: state?.matches.length ?? 0, activeIndex: state?.activeIndex ?? -1 };
    },
  });
  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, [focusRequest]);
  const close = () => {
    editor.commands.setSearchQuery("");
    onClose();
  };
  return (
    <div className="find-bar" role="search">
      <input ref={input} value={search.query} placeholder={translate("editor.findPlaceholder")} aria-label={translate("editor.find")}
        onChange={(event) => editor.commands.setSearchQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.nativeEvent.isComposing) {
            event.preventDefault();
            editor.commands.moveToSearchMatch(event.shiftKey ? -1 : 1);
          } else if (event.key === "Escape") {
            close();
          }
        }} />
      <span className="find-count">{search.query.trim() === "" ? "" : `${search.activeIndex + 1} / ${search.matchCount}`}</span>
      <button type="button" className="icon-button" aria-label={translate("editor.findPrevious")} disabled={search.matchCount === 0}
        onClick={() => editor.commands.moveToSearchMatch(-1)}><ChevronUp size={16} /></button>
      <button type="button" className="icon-button" aria-label={translate("editor.findNext")} disabled={search.matchCount === 0}
        onClick={() => editor.commands.moveToSearchMatch(1)}><ChevronDown size={16} /></button>
      <button type="button" className="icon-button" aria-label={translate("common.close")} onClick={close}><X size={16} /></button>
    </div>
  );
}
