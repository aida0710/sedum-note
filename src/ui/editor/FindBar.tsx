// メモの中の検索と置換の欄。打った言葉に色が付き、Enter で次、Shift+Enter で前の当たりへ移る。
// 大文字と小文字を区別するか・単語単位で探すか・正規表現で探すかをボタンで切り替える。置換の欄は、左端のボタンか Ctrl+R で出す
// （読むだけのメモでは出さない）。

import { type Editor, useEditorState } from "@tiptap/react";
import { CaseSensitive, ChevronDown, ChevronRight, ChevronUp, type LucideIcon, Regex, WholeWord, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { type MessageKey, translate } from "../i18n/translate";
import { isImeKeyEvent } from "../shared/imeKeyEvent";
import { searchHighlightKey } from "./searchHighlightExtension";
import { DEFAULT_SEARCH_OPTIONS, type SearchOptions } from "./searchMatches";

// 検索の欄を開く合図。serial が変わるたびに入力欄へカーソルを置き、showReplace なら置換の欄も出す。
export type FindRequest = { serial: number; showReplace: boolean };

type FindBarProps = {
  editor: Editor;
  request: FindRequest;
  onClose: () => void;
};

const ICON_SIZE = 16;

// 探し方の切り替えのボタン（VS Code と同じ並び）。
const SEARCH_OPTION_TOGGLES: Array<{ option: keyof SearchOptions; label: MessageKey; Icon: LucideIcon }> = [
  { option: "caseSensitive", label: "editor.findCaseSensitive", Icon: CaseSensitive },
  { option: "wholeWord", label: "editor.findWholeWord", Icon: WholeWord },
  { option: "regex", label: "editor.findRegex", Icon: Regex },
];

export function FindBar({ editor, request, onClose }: FindBarProps) {
  const input = useRef<HTMLInputElement>(null);
  const [replaceShown, setReplaceShown] = useState(request.showReplace);
  const [replacement, setReplacement] = useState("");
  const search = useEditorState({
    editor,
    selector: ({ editor: current }) => {
      const state = searchHighlightKey.getState(current.state);
      return {
        query: state?.query ?? "", options: state?.options ?? DEFAULT_SEARCH_OPTIONS, invalidPattern: state?.invalidPattern ?? false,
        matchCount: state?.matches.length ?? 0, activeIndex: state?.activeIndex ?? -1, editable: current.isEditable,
      };
    },
  });
  useEffect(() => {
    if (request.showReplace) {
      setReplaceShown(true);
    }
    input.current?.focus();
    input.current?.select();
    // 開く合図（serial）が変わったときだけ。showReplace は、その合図に付いてくる値。
  }, [request.serial]);
  const close = () => {
    editor.commands.setSearchQuery("");
    onClose();
  };
  const closeOnEscape = (event: React.KeyboardEvent) => {
    if (event.key === "Escape" && !isImeKeyEvent(event.nativeEvent)) {
      close();
    }
  };
  const searchFor = (query: string, options: SearchOptions) => editor.commands.setSearchQuery(query, options);
  const noMatch = search.matchCount === 0;
  const countText = search.invalidPattern ? translate("editor.findInvalidPattern")
    : search.query.trim() === "" ? "" : `${search.activeIndex + 1} / ${search.matchCount}`;
  const replaceAvailable = search.editable;
  return (
    <div className="find-bar" role="search" onKeyDown={closeOnEscape}>
      <div className="find-row">
        {replaceAvailable ? (
          <button type="button" className="icon-button" aria-label={translate("editor.showReplace")} title={translate("editor.showReplace")}
            aria-expanded={replaceShown} onClick={() => setReplaceShown(!replaceShown)}>
            {replaceShown ? <ChevronDown size={ICON_SIZE} /> : <ChevronRight size={ICON_SIZE} />}
          </button>
        ) : <span />}
        <input ref={input} className={search.invalidPattern ? "invalid" : ""} value={search.query} placeholder={translate("editor.findPlaceholder")}
          aria-label={translate("editor.find")} aria-invalid={search.invalidPattern}
          enterKeyHint="search" autoCapitalize="off" autoCorrect="off" spellCheck={false}
          onChange={(event) => searchFor(event.target.value, search.options)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !isImeKeyEvent(event.nativeEvent)) {
              event.preventDefault();
              editor.commands.moveToSearchMatch(event.shiftKey ? -1 : 1);
            }
          }} />
        <span className="find-controls">
          {SEARCH_OPTION_TOGGLES.map(({ option, label, Icon }) => (
            <button key={option} type="button" className={`icon-button${search.options[option] ? " on" : ""}`} aria-label={translate(label)} title={translate(label)}
              aria-pressed={search.options[option]} onClick={() => searchFor(search.query, { ...search.options, [option]: !search.options[option] })}>
              <Icon size={ICON_SIZE} />
            </button>
          ))}
          <span className={`find-count${search.invalidPattern ? " invalid" : ""}`} role="status">{countText}</span>
          <button type="button" className="icon-button" aria-label={translate("editor.findPrevious")} disabled={noMatch}
            onClick={() => editor.commands.moveToSearchMatch(-1)}><ChevronUp size={ICON_SIZE} /></button>
          <button type="button" className="icon-button" aria-label={translate("editor.findNext")} disabled={noMatch}
            onClick={() => editor.commands.moveToSearchMatch(1)}><ChevronDown size={ICON_SIZE} /></button>
          <button type="button" className="icon-button" aria-label={translate("common.close")} onClick={close}><X size={ICON_SIZE} /></button>
        </span>
      </div>
      {replaceShown && replaceAvailable && (
        <div className="find-row">
          <span />
          <input value={replacement} placeholder={translate(search.options.regex ? "editor.replaceRegexPlaceholder" : "editor.replacePlaceholder")}
            aria-label={translate("editor.replacePlaceholder")}
            onChange={(event) => setReplacement(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !isImeKeyEvent(event.nativeEvent)) {
                event.preventDefault();
                editor.commands.replaceActiveSearchMatch(replacement);
              }
            }} />
          <span className="find-controls">
            <button type="button" className="text-button" disabled={noMatch}
              onClick={() => editor.commands.replaceActiveSearchMatch(replacement)}>{translate("editor.replaceOne")}</button>
            <button type="button" className="text-button" disabled={noMatch}
              onClick={() => editor.commands.replaceAllSearchMatches(replacement)}>{translate("editor.replaceAll")}</button>
          </span>
        </div>
      )}
    </div>
  );
}
