// メモの題の欄。長い題は折り返して全部を見せる（高さは中身に合わせて伸びる）。
//   Enter: 本文の先頭へ移る。題の途中なら、カーソルから後ろの文字を本文の先頭の行へ送る。
//   ↓: 題の最後の行にカーソルがあるとき、本文の先頭へ移る。
// 題は 1 文字ごとに保存する（同期される記録へ書く）が、日本語の変換中の未確定の文字は保存せず、確定したときに保存する。

import { type RefObject, useEffect, useLayoutEffect, useState } from "react";
import { translate } from "../i18n/translate";
import { isImeKeyEvent } from "../shared/imeKeyEvent";
import { isCaretOnLastLine } from "./textareaCaretLine";

type NoteTitleInputProps = {
  // 本文から題へ戻るとき（titleBodyNavigation.ts）に、カーソルを置く先。
  inputRef: RefObject<HTMLTextAreaElement | null>;
  // 保存されている題。
  title: string;
  readOnly: boolean;
  autoFocus: boolean;
  onTitleChange: (title: string) => void;
  // 本文の先頭へ移る。textForBody は、題の途中で Enter を押したときの、カーソルから後ろの文字（無ければ空）。
  onMoveToBody: (textForBody: string) => void;
};

// 題は 1 行の文字。貼り付けた文字の改行は、空白 1 つにする。
function withoutLineBreaks(text: string): string {
  return text.replace(/\s*\n\s*/g, " ");
}

function fitHeightToContent(textarea: HTMLTextAreaElement): void {
  textarea.style.height = "auto";
  textarea.style.height = `${textarea.scrollHeight}px`;
}

export function NoteTitleInput({ inputRef, title, readOnly, autoFocus, onTitleChange, onMoveToBody }: NoteTitleInputProps) {
  const [draft, setDraft] = useState(title);
  // ほかのデバイスが題を変えたら、打っている最中でなければ表示を差し替える。
  useEffect(() => {
    if (document.activeElement !== inputRef.current) {
      setDraft(title);
    }
  }, [title, inputRef]);
  useLayoutEffect(() => {
    if (inputRef.current) {
      fitHeightToContent(inputRef.current);
    }
  }, [draft, inputRef]);
  // 本文の列の幅が変わると（AI のチャットや目次の開け閉め、窓の大きさ）、折り返しの行数も変わる。
  useEffect(() => {
    const textarea = inputRef.current;
    if (!textarea) {
      return undefined;
    }
    const observer = new ResizeObserver(() => fitHeightToContent(textarea));
    observer.observe(textarea);
    return () => observer.disconnect();
  }, [inputRef]);

  const saveTitle = (nextTitle: string) => {
    if (nextTitle !== title) {
      onTitleChange(nextTitle);
    }
  };
  return (
    <textarea ref={inputRef} className="title-input" rows={1} value={draft} placeholder={translate("editor.titlePlaceholder")} readOnly={readOnly} autoFocus={autoFocus}
      onChange={(event) => {
        const nextTitle = withoutLineBreaks(event.target.value);
        setDraft(nextTitle);
        if (!(event.nativeEvent as InputEvent).isComposing) {
          saveTitle(nextTitle);
        }
      }}
      onCompositionEnd={(event) => saveTitle(withoutLineBreaks(event.currentTarget.value))}
      onBlur={() => saveTitle(draft)}
      onKeyDown={(event) => {
        if (isImeKeyEvent(event.nativeEvent)) {
          return;
        }
        const textarea = event.currentTarget;
        if (event.key === "Enter") {
          event.preventDefault();
          const keptTitle = draft.slice(0, textarea.selectionStart);
          const textForBody = draft.slice(textarea.selectionEnd);
          if (textForBody !== "" && !readOnly) {
            setDraft(keptTitle);
            saveTitle(keptTitle);
          }
          onMoveToBody(readOnly ? "" : textForBody);
        } else if (event.key === "ArrowDown" && !event.shiftKey && isCaretOnLastLine(textarea)) {
          event.preventDefault();
          onMoveToBody("");
        }
      }} />
  );
}
