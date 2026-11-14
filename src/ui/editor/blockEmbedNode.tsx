// ブロックの埋め込み。ほかのメモ（か同じメモ）のブロックの中身を、本文の中にそのまま出す。
// 文書には、元のメモの ID とブロックの ID だけを入れる。中身は元の本文から読み、元が変わると（ほかのデバイスの
// 変更が同期で届いたときも）表示も変わる。ここでは書き換えられない。押すと元のメモを開いて、そのブロックまで送る。

import { type JSONContent, mergeAttributes, Node, NodeViewWrapper, type ReactNodeViewProps, ReactNodeViewRenderer } from "@tiptap/react";
import { EditorContent, useEditor } from "@tiptap/react";
import { yXmlFragmentToProsemirrorJSON } from "@tiptap/y-tiptap";
import { FileText } from "lucide-react";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type * as Y from "yjs";
import { BLOCK_ID_ATTRIBUTE, isBlockId, LINKABLE_BLOCK_NODE_NAMES } from "../../core/notes/bodyBlocks";
import { BLOCK_EMBED_NODE } from "../../core/notes/bodyText";
import { translate } from "../i18n/translate";
import { documentExtensions } from "./editorExtensions";
import { type NoteLinkTarget, NoteLinkTargetsContext } from "./noteLinkTargets";
import { ICON_SIZE } from "../shared/iconSizes";

// 埋め込みの中の埋め込みを、何段まで開くか。埋め込みが互いを含むと終わらなくなるので、ここで止める。
const MAX_EMBED_DEPTH = 3;
const LIST_ITEM_TYPES = ["listItem", "taskItem"];

// いま描いている埋め込みが、何段目か（本文に直接置いた埋め込みが 1 段目）。
const EmbedDepthContext = createContext(0);

// 元の本文から、その ID のブロックを取り出して、本文に置ける形にする。無ければ null。
function embeddedBlocks(body: Y.XmlFragment, blockId: string): JSONContent[] | null {
  const findIn = (parent: JSONContent): JSONContent[] | null => {
    for (const child of parent.content ?? []) {
      if (child.attrs?.[BLOCK_ID_ATTRIBUTE] === blockId && LINKABLE_BLOCK_NODE_NAMES.includes(child.type ?? "")) {
        // 箇条書きの項目は、元と同じ種類のリストに包んで置く。
        return LIST_ITEM_TYPES.includes(child.type ?? "") ? [{ type: parent.type, attrs: parent.attrs, content: [child] }] : [child];
      }
      const found = findIn(child);
      if (found) {
        return found;
      }
    }
    return null;
  };
  return findIn(yXmlFragmentToProsemirrorJSON(body) as JSONContent);
}

// 埋め込むブロックの今の中身（JSON の文字）。元の本文が変わるたびに読み直す。文字で持つのは、
// 元の本文のほかの所が変わっただけのときに、描き直さないため。
function useEmbeddedBlocks(body: Y.XmlFragment | null, blockId: string | null): string | null {
  const [serializedBlocks, setSerializedBlocks] = useState<string | null>(null);
  useEffect(() => {
    if (!body || blockId === null) {
      setSerializedBlocks(null);
      return undefined;
    }
    const readBlocks = () => {
      const blocks = embeddedBlocks(body, blockId);
      setSerializedBlocks(blocks ? JSON.stringify(blocks) : null);
    };
    readBlocks();
    body.observeDeep(readBlocks);
    return () => body.unobserveDeep(readBlocks);
  }, [body, blockId]);
  return serializedBlocks;
}

// 埋め込んだ中身を、本文と同じ見た目で、読み取り専用で出す。
function EmbeddedBlocks({ serializedBlocks }: { serializedBlocks: string }) {
  // 拡張は 1 回だけ作る。描くたびに作ると、useEditor が設定が変わったと見て、描くたび（メモを保存するたび）に
  // エディタの設定を当て直す。
  const extensions = useMemo(() => documentExtensions(), []);
  const editor = useEditor({ extensions, editable: false });
  useEffect(() => {
    // 中身の中のノード（リンク、数式、埋め込み）は React で描かれ、その場で描き切ろうとする。React が画面を
    // 更新している最中（この effect の中）にはそれができないので、更新が済んだ直後に入れる。
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled && !editor.isDestroyed) {
        editor.commands.setContent({ type: "doc", content: JSON.parse(serializedBlocks) as JSONContent[] });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [editor, serializedBlocks]);
  return <EditorContent editor={editor} />;
}

// 中身を出せないときに、代わりに出す文。出せるなら null。
function unavailableMessage(target: NoteLinkTarget, state: { tooDeep: boolean; blockFound: boolean }): string | null {
  if (target.state === "missing") {
    return translate("editor.noteLinkMissing");
  }
  const title = target.title || translate("sidebar.untitled");
  if (target.state === "trashed") {
    return translate("editor.noteLinkTrashed", { title });
  }
  if (state.tooDeep) {
    return translate("editor.blockEmbedTooDeep");
  }
  return state.blockFound ? null : translate("editor.blockLinkMissing", { title });
}

function BlockEmbedView({ node }: ReactNodeViewProps) {
  const noteId = String(node.attrs.noteId ?? "");
  const blockId = isBlockId(node.attrs.blockId) ? node.attrs.blockId : null;
  const targets = useContext(NoteLinkTargetsContext);
  const depth = useContext(EmbedDepthContext) + 1;
  const target = targets.describeTarget(noteId, blockId);
  const serializedBlocks = useEmbeddedBlocks(target.state === "live" ? targets.noteBody(noteId) : null, blockId);
  const message = unavailableMessage(target, { tooDeep: depth > MAX_EMBED_DEPTH, blockFound: serializedBlocks !== null });
  return (
    <NodeViewWrapper className="block-embed" contentEditable={false}>
      {target.state !== "missing" && (
        <button type="button" className="block-embed-source" onClick={() => targets.openNote(noteId, serializedBlocks !== null && blockId !== null ? blockId : undefined)}>
          <FileText size={ICON_SIZE.chip} />{target.title || translate("sidebar.untitled")}
        </button>
      )}
      {message !== null && <div className="tree-empty">{message}</div>}
      {message === null && serializedBlocks !== null && (
        <EmbedDepthContext.Provider value={depth}><EmbeddedBlocks serializedBlocks={serializedBlocks} /></EmbedDepthContext.Provider>
      )}
    </NodeViewWrapper>
  );
}

export const BlockEmbed = Node.create({
  name: BLOCK_EMBED_NODE,
  group: "block",
  atom: true,
  addAttributes() {
    return { noteId: { default: null }, blockId: { default: null } };
  },
  parseHTML() {
    return [{
      tag: "div[data-block-embed-note-id]",
      getAttrs: (element) => ({ noteId: element.getAttribute("data-block-embed-note-id"), blockId: element.getAttribute("data-block-embed-block-id") }),
    }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes({ "data-block-embed-note-id": HTMLAttributes.noteId, "data-block-embed-block-id": HTMLAttributes.blockId })];
  },
  addNodeView() {
    // 埋め込みの中の操作（リンクを押す、文字を選ぶ）を、外のエディタに渡さない。
    return ReactNodeViewRenderer(BlockEmbedView, { stopEvent: () => true });
  },
});
