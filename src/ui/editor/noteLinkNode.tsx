// 本文に置く、メモへのリンクのノード。文書にはリンク先のメモの ID（ブロックを指すなら、そのブロックの ID も）
// だけを入れ、表示するタイトルとブロックの文字はリンク先から引く。押すとそのメモを開き、ブロックを指していればそこまで送る。

import { mergeAttributes, Node, NodeViewWrapper, type ReactNodeViewProps, ReactNodeViewRenderer } from "@tiptap/react";
import { FileText } from "lucide-react";
import { useContext } from "react";
import { isBlockId } from "../../core/notes/bodyBlocks";
import { NOTE_LINK_NODE } from "../../core/notes/bodyText";
import { translate } from "../i18n/translate";
import { type NoteLinkTarget, NoteLinkTargetsContext } from "./noteLinkTargets";

// リンクに出す、ブロックの文字の長さの上限。行の中に置くので、長い段落は頭だけを出す。
const MAX_BLOCK_TEXT_LENGTH = 40;

function noteLinkLabel(target: NoteLinkTarget): string {
  if (target.state === "missing") {
    return translate("editor.noteLinkMissing");
  }
  const title = target.title || translate("sidebar.untitled");
  if (target.state === "trashed") {
    return translate("editor.noteLinkTrashed", { title });
  }
  switch (target.block.state) {
    case "none":
      return title;
    case "concealed":
      return translate("lock.blockLinkConcealed", { title });
    case "missing":
      return translate("editor.blockLinkMissing", { title });
    case "found": {
      const { text } = target.block;
      return translate("editor.blockLinkLabel", { title, text: text.length > MAX_BLOCK_TEXT_LENGTH ? `${text.slice(0, MAX_BLOCK_TEXT_LENGTH)}…` : text });
    }
  }
}

function NoteLinkView({ node }: ReactNodeViewProps) {
  const noteId = String(node.attrs.noteId ?? "");
  const blockId = isBlockId(node.attrs.blockId) ? node.attrs.blockId : null;
  const targets = useContext(NoteLinkTargetsContext);
  const target = targets.describeTarget(noteId, blockId);
  const blockIsMissing = target.state !== "missing" && target.block.state === "missing";
  return (
    <NodeViewWrapper as="span" className={`note-link ${blockIsMissing ? "missing" : target.state}`}>
      {/* 指したブロックが消えていても、メモは開ける。 */}
      <button type="button" disabled={target.state === "missing"} onClick={() => targets.openNote(noteId, blockIsMissing ? undefined : blockId ?? undefined)}>
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
    return { noteId: { default: null }, blockId: { default: null } };
  },
  parseHTML() {
    return [{
      tag: "span[data-note-link-id]",
      getAttrs: (element) => ({ noteId: element.getAttribute("data-note-link-id"), blockId: element.getAttribute("data-note-link-block-id") }),
    }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes({ "data-note-link-id": HTMLAttributes.noteId, "data-note-link-block-id": HTMLAttributes.blockId })];
  },
  addNodeView() {
    return ReactNodeViewRenderer(NoteLinkView);
  },
});
