// メモの中の検索と置換の欄。打った言葉に色が付き、Enter で次、Shift+Enter で前の当たりへ移る。
// 置換の欄は、ボタンで開く（読むだけのメモでは出さない）。

import { type Editor, useEditorState } from "@tiptap/react";
import { ChevronDown, ChevronUp, Replace, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { translate } from "../i18n/translate";
import { isImeKeyEvent } from "../shared/imeKeyEvent";
import { searchHighlightKey } from "./searchHighlightExtension";

type FindBarProps = {
  editor: Editor;
  // 開くたびに変わる値。変わったら入力欄にカーソルを置く（開いたまま Ctrl+F を押したとき）。
  focusRequest: number;
  onClose: () => void;
};

export function FindBar({ editor, focusRequest, onClose }: FindBarProps) {
  const input = useRef<HTMLInputElement>(null);
  const [replaceShown, setReplaceShown] = useState(false);
  const [replacement, setReplacement] = useState("");
  const search = useEditorState({
    editor,
    selector: ({ editor: current }) => {
      const state = searchHighlightKey.getState(current.state);
      return { query: state?.query ?? "", matchCount: state?.matches.length ?? 0, activeIndex: state?.activeIndex ?? -1, editable: current.isEditable };
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
  const closeOnEscape = (event: React.KeyboardEvent) => {
    if (event.key === "Escape" && !isImeKeyEvent(event.nativeEvent)) {
      close();
    }
  };
  const noMatch = search.matchCount === 0;
  return (
    <div className="find-bar" role="search" onKeyDown={closeOnEscape}>
      <div className="find-row">
        <input ref={input} value={search.query} placeholder={translate("editor.findPlaceholder")} aria-label={translate("editor.find")}
          onChange={(event) => editor.commands.setSearchQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !isImeKeyEvent(event.nativeEvent)) {
              event.preventDefault();
              editor.commands.moveToSearchMatch(event.shiftKey ? -1 : 1);
            }
          }} />
        <span className="find-count">{search.query.trim() === "" ? "" : `${search.activeIndex + 1} / ${search.matchCount}`}</span>
        <button type="button" className="icon-button" aria-label={translate("editor.findPrevious")} disabled={noMatch}
          onClick={() => editor.commands.moveToSearchMatch(-1)}><ChevronUp size={16} /></button>
        <button type="button" className="icon-button" aria-label={translate("editor.findNext")} disabled={noMatch}
          onClick={() => editor.commands.moveToSearchMatch(1)}><ChevronDown size={16} /></button>
        {search.editable && (
          <button type="button" className={`icon-button${replaceShown ? " on" : ""}`} aria-label={translate("editor.showReplace")} aria-pressed={replaceShown}
            onClick={() => setReplaceShown(!replaceShown)}><Replace size={16} /></button>
        )}
        <button type="button" className="icon-button" aria-label={translate("common.close")} onClick={close}><X size={16} /></button>
      </div>
      {replaceShown && search.editable && (
        <div className="find-row">
          <input value={replacement} placeholder={translate("editor.replacePlaceholder")} aria-label={translate("editor.replacePlaceholder")}
            onChange={(event) => setReplacement(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !isImeKeyEvent(event.nativeEvent)) {
                event.preventDefault();
                editor.commands.replaceActiveSearchMatch(replacement);
              }
            }} />
          <button type="button" className="text-button" disabled={noMatch}
            onClick={() => editor.commands.replaceActiveSearchMatch(replacement)}>{translate("editor.replaceOne")}</button>
          <button type="button" className="text-button" disabled={noMatch}
            onClick={() => editor.commands.replaceAllSearchMatches(replacement)}>{translate("editor.replaceAll")}</button>
        </div>
      )}
    </div>
  );
}
