// データベース表示の「＋ 新しいメモ」（表の下と、ボードの列の下）。押すとその場にタイトルの欄を出し、決めたタイトルでメモを作る。
//
// タイトルは、メモを開かずにその場で打つ。表やボードへ続けて何件も足すとき、1 件ごとにメモのタブへ移らずに済み、
// 足した行のプロパティもそのまま表で入れられる。メモはタイトルを決めたときに作る。押した時点で作ると、打っている間に
// その行が並べ替えで動き、やめたときにタイトルの無いメモが残るため。空のまま決めたときと Escape では作らない。

import { Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { translate } from "../i18n/translate";
import { InlineNameInput } from "./InlineNameInput";
import { ICON_SIZE } from "../shared/iconSizes";

type DatabaseNewNoteButtonProps = {
  // 決めたタイトル（空ではない）でメモを作る。
  onCreate: (title: string) => void;
};

export function DatabaseNewNoteButton({ onCreate }: DatabaseNewNoteButtonProps) {
  const [typingTitle, setTypingTitle] = useState(false);
  const titleFieldRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  // Enter か Escape でタイトルの欄を閉じたときは、続けて足せるよう、ボタンへフォーカスを戻す。
  // 欄の外を押して閉じたときは、押した先にフォーカスを残す。
  const returnsFocusToButton = useRef(false);
  useEffect(() => {
    if (!typingTitle && returnsFocusToButton.current) {
      returnsFocusToButton.current = false;
      buttonRef.current?.focus();
    }
  }, [typingTitle]);
  if (typingTitle) {
    return (
      <div ref={titleFieldRef} className="database-new-note">
        <InlineNameInput placeholder={translate("editor.titlePlaceholder")} onDone={(title) => {
          // 欄を離れて閉じたときは、フォーカスはもう欄の外へ移っている。キーで閉じたときだけ、まだ欄の中にある。
          returnsFocusToButton.current = titleFieldRef.current?.contains(document.activeElement) ?? false;
          setTypingTitle(false);
          if (title) {
            onCreate(title);
          }
        }} />
      </div>
    );
  }
  return (
    <button ref={buttonRef} type="button" className="database-new-note-button" onClick={() => setTypingTitle(true)}>
      <Plus size={ICON_SIZE.row} />{translate("database.newNote")}
    </button>
  );
}
