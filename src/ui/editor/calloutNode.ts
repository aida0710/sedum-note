// コールアウト（色付きの囲み）。注意や補足を目立たせるブロックで、種類ごとに色が変わる。
// Markdown では、引用の先頭に種類を書く形（> [!note]）と往復する。

import { type JSONContent, Node } from "@tiptap/core";

export const CALLOUT_NODE = "callout";
export const CALLOUT_KINDS = ["note", "tip", "warning", "danger"] as const;
export type CalloutKind = (typeof CALLOUT_KINDS)[number];
const DEFAULT_CALLOUT_KIND: CalloutKind = "note";

function calloutKindOf(value: unknown): CalloutKind {
  return CALLOUT_KINDS.find((kind) => kind === value) ?? DEFAULT_CALLOUT_KIND;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    callout: {
      // 今のブロックをコールアウトで包む。コールアウトの中なら、種類を変える。
      setCallout: (kind: CalloutKind) => ReturnType;
      unsetCallout: () => ReturnType;
    };
  }
}

export const Callout = Node.create({
  name: CALLOUT_NODE,
  group: "block",
  content: "block+",
  defining: true,
  addAttributes() {
    return {
      kind: {
        default: DEFAULT_CALLOUT_KIND,
        parseHTML: (element) => calloutKindOf(element.getAttribute("data-callout")),
        renderHTML: (attributes) => ({ "data-callout": calloutKindOf(attributes.kind) }),
      },
    };
  },
  parseHTML() {
    return [{ tag: "div[data-callout]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", { ...HTMLAttributes, class: "callout" }, 0];
  },
  addCommands() {
    return {
      setCallout: (kind) => ({ commands, editor }) =>
        (editor.isActive(CALLOUT_NODE) ? commands.updateAttributes(CALLOUT_NODE, { kind }) : commands.wrapIn(CALLOUT_NODE, { kind })),
      unsetCallout: () => ({ commands }) => commands.lift(CALLOUT_NODE),
    };
  },
  renderMarkdown: (node, helpers) => {
    const lines = (node.content ?? []).map((child) => helpers.renderChildren([child]).split("\n").map((line) => (line.trim() === "" ? ">" : `> ${line}`)).join("\n"));
    return [`> [!${calloutKindOf(node.attrs?.kind)}]`, ...lines].join("\n>\n");
  },
});

const CALLOUT_MARKER = /^\[!(\w+)\][ \t]*\n?/;

// Markdown から読んだ引用が、先頭に種類を書いたもの（> [!note]）なら、コールアウトにする。知らない種類は引用のまま残す。
export function calloutFromBlockquote(blockquote: JSONContent): JSONContent {
  const [firstBlock, ...otherBlocks] = blockquote.content ?? [];
  const [firstInline, ...otherInlines] = firstBlock?.content ?? [];
  const marker = firstBlock?.type === "paragraph" && firstInline?.type === "text" ? CALLOUT_MARKER.exec(firstInline.text ?? "") : null;
  const kind = CALLOUT_KINDS.find((candidate) => candidate === marker?.[1]?.toLowerCase());
  if (!marker || !kind || !firstBlock || !firstInline) {
    return blockquote;
  }
  const textAfterMarker = (firstInline.text ?? "").slice(marker[0].length);
  // 種類の行のあとに改行があれば、その改行（hardBreak）も落とす。
  const inlinesAfterMarker = textAfterMarker === "" ? otherInlines.filter((inline, index) => !(index === 0 && inline.type === "hardBreak")) : [{ ...firstInline, text: textAfterMarker }, ...otherInlines];
  const blocks = inlinesAfterMarker.length > 0 ? [{ ...firstBlock, content: inlinesAfterMarker }, ...otherBlocks] : otherBlocks;
  return { type: CALLOUT_NODE, attrs: { kind }, content: blocks.length > 0 ? blocks : [{ type: "paragraph" }] };
}
