// メモの目次。本文の見出しを並べ、押すとその見出しへ移る。PC では本文の横、スマホではメニューの中に出す。

import { type Editor, useEditorState } from "@tiptap/react";
import { translate } from "../i18n/translate";

type OutlineHeading = { level: number; text: string; position: number };

// 見出しの階層ごとの字下げ。
const OUTLINE_INDENT_STEP = 12;

function headingsOf(editor: Editor): OutlineHeading[] {
  const headings: OutlineHeading[] = [];
  editor.state.doc.descendants((node, position) => {
    if (node.type.name === "heading") {
      headings.push({ level: Number(node.attrs.level), text: node.textContent, position });
    }
    // 見出しは入れ子のブロックの中（引用など）にもあるので、中も見る。
    return !node.isTextblock;
  });
  return headings;
}

export function NoteOutline({ editor, onPick }: { editor: Editor; onPick?: () => void }) {
  // 見出しの文字と数が変わったときだけ描き直す。
  const serialized = useEditorState({ editor, selector: ({ editor: current }) => JSON.stringify(headingsOf(current)) });
  const headings = JSON.parse(serialized) as OutlineHeading[];
  const goTo = (heading: OutlineHeading) => {
    editor.chain().setTextSelection(heading.position + 1).run();
    (editor.view.nodeDOM(heading.position) as HTMLElement | null)?.scrollIntoView({ block: "start", behavior: "smooth" });
    onPick?.();
  };
  return (
    <nav className="outline" aria-label={translate("editor.outline")}>
      <div className="section-title">{translate("editor.outline")}</div>
      {headings.length === 0 && <div className="tree-empty">{translate("editor.outlineEmpty")}</div>}
      {headings.map((heading) => (
        <button key={heading.position} type="button" className="outline-item" style={{ paddingLeft: 8 + (heading.level - 1) * OUTLINE_INDENT_STEP }}
          onClick={() => goTo(heading)}>
          {heading.text || translate("editor.outlineUntitledHeading")}
        </button>
      ))}
    </nav>
  );
}
