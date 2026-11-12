// クエリのブロック。条件（ノートブック、タグ、言葉、プロパティの値）に合うメモの一覧を、本文の中に出す。
// 文書には条件だけを入れ、一覧は開くたびに今のメモから作る。Markdown では、言語が sedum-query のコードの囲みと往復する。

import { type JSONContent, mergeAttributes, Node, NodeViewWrapper, type ReactNodeViewProps, ReactNodeViewRenderer } from "@tiptap/react";
import { FileText, ListFilter } from "lucide-react";
import { useContext } from "react";
import { countTags } from "../../core/notes/noteQueries";
import { EMPTY_NOTE_QUERY, type NoteQueryCondition, noteQueryConditionFrom, notesMatchingQuery } from "../../core/notes/noteQueryCondition";
import { translate } from "../i18n/translate";
import { NoteLinkTargetsContext } from "./noteLinkTargets";
import { NoteQuerySourceContext } from "./noteQuerySource";

export const NOTE_QUERY_NODE = "noteQuery";
// Markdown で条件を書くコードの囲みの言語。
const QUERY_CODE_LANGUAGE = "sedum-query";
const NO_CHOICE = "";
// 一覧に出す件数。これより多いときは、残りの件数を出す。
const MAX_LISTED_NOTES = 50;

function NoteQueryView({ node, updateAttributes, editor }: ReactNodeViewProps) {
  const condition = noteQueryConditionFrom(node.attrs);
  const { summaries, notebooks } = useContext(NoteQuerySourceContext);
  const { openNote } = useContext(NoteLinkTargetsContext);
  const matches = notesMatchingQuery(summaries, condition);
  const properties = notebooks.find((notebook) => notebook.id === condition.notebookId)?.content.properties ?? [];
  const change = (changes: Partial<NoteQueryCondition>) => updateAttributes(changes);
  const editable = editor.isEditable;
  return (
    <NodeViewWrapper className="note-query" contentEditable={false}>
      <div className="note-query-conditions">
        <ListFilter size={14} />
        <select value={condition.notebookId ?? NO_CHOICE} disabled={!editable} aria-label={translate("query.notebook")}
          onChange={(event) => change({ notebookId: event.target.value || null, propertyId: null, propertyValue: "" })}>
          <option value={NO_CHOICE}>{translate("query.anyNotebook")}</option>
          {notebooks.map((notebook) => <option key={notebook.id} value={notebook.id}>{notebook.content.name}</option>)}
        </select>
        <select value={condition.tag ?? NO_CHOICE} disabled={!editable} aria-label={translate("query.tag")} onChange={(event) => change({ tag: event.target.value || null })}>
          <option value={NO_CHOICE}>{translate("query.anyTag")}</option>
          {countTags(summaries).map(({ tag }) => <option key={tag} value={tag}>#{tag}</option>)}
        </select>
        {properties.length > 0 && (
          <>
            <select value={condition.propertyId ?? NO_CHOICE} disabled={!editable} aria-label={translate("query.property")}
              onChange={(event) => change({ propertyId: event.target.value || null })}>
              <option value={NO_CHOICE}>{translate("query.anyProperty")}</option>
              {properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}
            </select>
            {condition.propertyId !== null && (
              <input value={condition.propertyValue} readOnly={!editable} placeholder={translate("query.propertyValue")} aria-label={translate("query.propertyValue")}
                onChange={(event) => change({ propertyValue: event.target.value })} />
            )}
          </>
        )}
        <input value={condition.searchText} readOnly={!editable} placeholder={translate("query.searchText")} aria-label={translate("query.searchText")}
          onChange={(event) => change({ searchText: event.target.value })} />
      </div>
      <div className="note-query-results">
        {matches.length === 0 && <div className="tree-empty">{translate("query.noResults")}</div>}
        {matches.slice(0, MAX_LISTED_NOTES).map(({ note }) => (
          <button key={note.id} type="button" className="menu-item" onClick={() => openNote(note.id)}>
            <FileText size={13} /><span className="nav-label">{note.content.title || translate("sidebar.untitled")}</span>
          </button>
        ))}
        {matches.length > MAX_LISTED_NOTES && <div className="tree-empty">{translate("query.moreResults", { count: matches.length - MAX_LISTED_NOTES })}</div>}
      </div>
    </NodeViewWrapper>
  );
}

export const NoteQuery = Node.create({
  name: NOTE_QUERY_NODE,
  group: "block",
  atom: true,
  addAttributes() {
    return Object.fromEntries(Object.entries(EMPTY_NOTE_QUERY).map(([name, value]) => [name, { default: value }]));
  },
  parseHTML() {
    return [{ tag: "div[data-note-query]", getAttrs: (element) => noteQueryConditionFrom(JSON.parse(element.getAttribute("data-note-query") ?? "{}")) }];
  },
  renderHTML({ node }) {
    return ["div", mergeAttributes({ "data-note-query": JSON.stringify(noteQueryConditionFrom(node.attrs)) })];
  },
  addNodeView() {
    // ブロックの中の入力欄や選択肢の操作を、エディタに渡さない（渡すと、WebKit では打った文字が本文に入る）。
    return ReactNodeViewRenderer(NoteQueryView, { stopEvent: () => true });
  },
  renderMarkdown: (node) => `\`\`\`${QUERY_CODE_LANGUAGE}\n${JSON.stringify(noteQueryConditionFrom(node.attrs))}\n\`\`\``,
});

// Markdown から読んだコードの囲みが、クエリの条件を書いたもの（言語が sedum-query）なら、クエリのブロックにする。
export function noteQueryFromCodeBlock(codeBlock: JSONContent): JSONContent {
  if (codeBlock.attrs?.language !== QUERY_CODE_LANGUAGE) {
    return codeBlock;
  }
  try {
    return { type: NOTE_QUERY_NODE, attrs: noteQueryConditionFrom(JSON.parse(codeBlock.content?.map((inline) => inline.text ?? "").join("") ?? "")) };
  } catch {
    return codeBlock;
  }
}
