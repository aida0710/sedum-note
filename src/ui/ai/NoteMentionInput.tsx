// チャットの入力欄。「@」を打つとメモを題で探す候補が出て、選ぶとそのメモを文脈に足す（入力欄からは「@…」を消す）。
// Enter で送り、Shift+Enter で改行する。

import { FileText } from "lucide-react";
import { useState } from "react";
import type { LiveNote } from "../../core/notes/noteRecords";
import { translate } from "../i18n/translate";
import { isImeKeyEvent } from "../shared/imeKeyEvent";
import { ICON_SIZE } from "../shared/iconSizes";

type NoteMentionInputProps = {
  value: string;
  onChange: (value: string) => void;
  // 「@」の候補にするメモ（ゴミ箱の外）。
  notes: LiveNote[];
  onMention: (note: LiveNote) => void;
  onSubmit: () => void;
  disabled: boolean;
  // 出したときに、入力欄にフォーカスを移すか。
  autoFocus?: boolean;
};

// 一度に出す候補の数。これより多いときは、続きを打って絞ってもらう。
const MAX_MENTION_CANDIDATES = 8;
// カーソルの直前の「@言葉」（空白を含まない）。行の途中の「@」でも拾う。
const MENTION_BEFORE_CURSOR = /@([^\s@]*)$/;

export function NoteMentionInput({ value, onChange, notes, onMention, onSubmit, disabled, autoFocus = false }: NoteMentionInputProps) {
  // 「@」のあとに打っている言葉。「@」を打っていなければ null。
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const candidates = mentionQuery === null
    ? []
    : notes
      .filter((note) => note.content.title.toLocaleLowerCase().includes(mentionQuery.toLocaleLowerCase()))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, MAX_MENTION_CANDIDATES);
  const selected = Math.min(selectedIndex, Math.max(candidates.length - 1, 0));

  const readMention = (text: string, cursor: number) => {
    setMentionQuery(MENTION_BEFORE_CURSOR.exec(text.slice(0, cursor))?.[1] ?? null);
    setSelectedIndex(0);
  };
  const choose = (note: LiveNote | undefined, textarea: HTMLTextAreaElement) => {
    if (!note) {
      return;
    }
    const cursor = textarea.selectionStart;
    onChange(value.slice(0, cursor).replace(MENTION_BEFORE_CURSOR, "") + value.slice(cursor));
    setMentionQuery(null);
    onMention(note);
  };

  return (
    <div className="mention-input">
      {candidates.length > 0 && (
        <div className="mention-candidates" role="listbox" aria-label={translate("ai.mentionCandidates")}>
          {candidates.map((note, index) => (
            <button key={note.id} type="button" role="option" aria-selected={index === selected} className={`menu-item${index === selected ? " on" : ""}`}
              // 押しても入力欄からカーソルが外れないようにする。
              onMouseDown={(event) => event.preventDefault()}
              onClick={(event) => choose(note, event.currentTarget.closest(".mention-input")!.querySelector("textarea")!)}>
              <FileText size={ICON_SIZE.row} /><span className="nav-label">{note.content.title || translate("sidebar.untitled")}</span>
            </button>
          ))}
        </div>
      )}
      <textarea value={value} rows={3} disabled={disabled} autoFocus={autoFocus} placeholder={translate("ai.chatPlaceholder")} aria-label={translate("ai.chatInput")}
        onChange={(event) => { onChange(event.target.value); readMention(event.target.value, event.target.selectionStart); }}
        onKeyDown={(event) => {
          if (isImeKeyEvent(event.nativeEvent)) {
            return;
          }
          if (candidates.length > 0 && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
            event.preventDefault();
            setSelectedIndex((selected + (event.key === "ArrowDown" ? 1 : -1) + candidates.length) % candidates.length);
          } else if (candidates.length > 0 && (event.key === "Enter" || event.key === "Tab")) {
            event.preventDefault();
            choose(candidates[selected], event.currentTarget);
          } else if (mentionQuery !== null && event.key === "Escape") {
            event.stopPropagation();
            setMentionQuery(null);
          } else if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            onSubmit();
          }
        }} />
    </div>
  );
}
