// 本文に置く、メモへのリンクのノード。文書にはリンク先のメモの ID（ブロックを指すなら、そのブロックの ID も）
// だけを入れ、表示するタイトルとブロックの文字はリンク先から引く。押すとそのメモを開き、ブロックを指していればそこまで送る。
// ポインターを少し乗せたままにすると、リンク先の中身の見本を出す（NoteLinkPreview.tsx）。

import { mergeAttributes, Node, NodeViewWrapper, type ReactNodeViewProps, ReactNodeViewRenderer } from "@tiptap/react";
import { FileText } from "lucide-react";
import { useContext, useEffect, useRef, useState } from "react";
import { bodyPlainText } from "../../core/notes/bodyText";
import { isBlockId } from "../../core/notes/bodyBlocks";
import { NOTE_LINK_NODE } from "../../core/notes/bodyText";
import { translate } from "../i18n/translate";
import { type NoteLinkTarget, NoteLinkTargetsContext } from "./noteLinkTargets";
import { NoteLinkPreview } from "./NoteLinkPreview";

// ポインターを乗せてから見本を出すまでの待ち時間（ms）。通りすぎただけで出さないように。
const PREVIEW_DELAY_MILLISECONDS = 450;

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
  const [previewAnchor, setPreviewAnchor] = useState<HTMLElement | null>(null);
  const previewTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(previewTimer.current), []);
  const showPreviewSoon = (element: HTMLElement) => {
    window.clearTimeout(previewTimer.current);
    previewTimer.current = window.setTimeout(() => setPreviewAnchor(element), PREVIEW_DELAY_MILLISECONDS);
  };
  const hidePreview = () => {
    window.clearTimeout(previewTimer.current);
    setPreviewAnchor(null);
  };
  // 見本の本文。ブロックへのリンクならそのブロックの文字、メモへのリンクなら本文の頭。
  // リンク先があるのに本文を読めないのは、ロックで隠しているとき。中身の代わりに、その旨を出す。
  const previewText = () => {
    if (target.state === "missing") {
      return "";
    }
    if (target.block.state === "found") {
      return target.block.text;
    }
    const body = targets.noteBody(noteId);
    return body ? bodyPlainText(body) : translate("lock.embedConcealed");
  };
  return (
    <NodeViewWrapper as="span" className={`note-link ${blockIsMissing ? "missing" : target.state}`}>
      {/* 指したブロックが消えていても、メモは開ける。 */}
      <button type="button" disabled={target.state === "missing"} onClick={() => { hidePreview(); targets.openNote(noteId, blockIsMissing ? undefined : blockId ?? undefined); }}
        onMouseEnter={(event) => target.state !== "missing" && showPreviewSoon(event.currentTarget)} onMouseLeave={hidePreview}>
        <FileText size={13} />{noteLinkLabel(target)}
      </button>
      {previewAnchor && target.state !== "missing" && <NoteLinkPreview anchor={previewAnchor} title={target.title} text={previewText()} />}
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
