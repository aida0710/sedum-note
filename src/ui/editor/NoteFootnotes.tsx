// 脚注の文の一覧。本文の下に、本文に出てくる順の番号で並べる。文はここで書き、番号を押すと本文の印へ移る。

import { type Editor, useEditorState } from "@tiptap/react";
import { useEffect, useRef } from "react";
import { translate } from "../i18n/translate";
import { type Footnote, footnoteInputId, footnotesOf } from "./footnoteNode";

export function NoteFootnotes({ editor }: { editor: Editor }) {
  // 選択を動かしただけでは描き直さないよう、中身を文字にして比べる。
  const serialized = useEditorState({ editor, selector: ({ editor: current }) => JSON.stringify(footnotesOf(current.state.doc)) });
  const footnotes = JSON.parse(serialized) as Footnote[];
  // 脚注を入れた直後（文が空の脚注が増えたとき）は、その文の欄にカーソルを置く。
  const previousCount = useRef(footnotes.length);
  useEffect(() => {
    const emptyIndex = footnotes.findIndex((footnote) => footnote.text === "");
    if (footnotes.length > previousCount.current && emptyIndex !== -1) {
      document.getElementById(footnoteInputId(emptyIndex))?.focus();
    }
    previousCount.current = footnotes.length;
  }, [footnotes]);
  if (footnotes.length === 0) {
    return null;
  }
  const goToReference = (footnote: Footnote) => {
    editor.chain().focus().setNodeSelection(footnote.position).run();
    (editor.view.nodeDOM(footnote.position) as HTMLElement | null)?.scrollIntoView({ block: "center", behavior: "smooth" });
  };
  return (
    <section className="footnotes" aria-label={translate("editor.footnotes")}>
      {footnotes.map((footnote, index) => (
        <div key={index} className="footnote">
          <button type="button" className="footnote-number" aria-label={translate("editor.footnoteGoToReference", { number: index + 1 })} onClick={() => goToReference(footnote)}>
            {index + 1}
          </button>
          <input id={footnoteInputId(index)} value={footnote.text} readOnly={!editor.isEditable} placeholder={translate("editor.footnotePlaceholder")}
            aria-label={translate("editor.footnoteText", { number: index + 1 })}
            onChange={(event) => editor.view.dispatch(editor.state.tr.setNodeAttribute(footnote.position, "text", event.target.value))} />
        </div>
      ))}
    </section>
  );
}
