// 本文に置く、ほかのメモへのリンクのノード。文書にはリンク先のメモの ID だけを入れ、
// 表示するタイトルはリンク先から引く。押すとそのメモを開く。

import { mergeAttributes, Node, NodeViewWrapper, type ReactNodeViewProps, ReactNodeViewRenderer } from "@tiptap/react";
import { FileText } from "lucide-react";
import { useContext } from "react";
import { NOTE_LINK_NODE } from "../../core/notes/bodyText";
import { translate } from "../i18n/translate";
import { type NoteLinkTarget, NoteLinkTargetsContext } from "./noteLinkTargets";

function noteLinkLabel(target: NoteLinkTarget): string {
  if (target.state === "missing") {
    return translate("editor.noteLinkMissing");
  }
  const title = target.title || translate("sidebar.untitled");
  return target.state === "trashed" ? translate("editor.noteLinkTrashed", { title }) : title;
}

function NoteLinkView({ node }: ReactNodeViewProps) {
  const noteId = String(node.attrs.noteId ?? "");
  const targets = useContext(NoteLinkTargetsContext);
  const target = targets.describeTarget(noteId);
  return (
    <NodeViewWrapper as="span" className={`note-link ${target.state}`}>
      <button type="button" disabled={target.state === "missing"} onClick={() => targets.openNote(noteId)}>
        <FileText size={13} />{noteLinkLabel(target)}
      </button>
    </NodeViewWrapper>
  );
}

export const NoteLink = Node.create({
  name: NOTE_LINK_NODE,
  group: "inline",
  inline: true,
  atom: true,
  addAttributes() {
    return { noteId: { default: null } };
  },
  parseHTML() {
    return [{ tag: "span[data-note-link-id]", getAttrs: (element) => ({ noteId: element.getAttribute("data-note-link-id") }) }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes({ "data-note-link-id": HTMLAttributes.noteId })];
  },
  addNodeView() {
    return ReactNodeViewRenderer(NoteLinkView);
  },
});
