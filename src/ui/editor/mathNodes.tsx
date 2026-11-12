// 数式（LaTeX）のノード。行の中の数式（inlineMath）と、独立した行の数式（blockMath）。
// 文書には LaTeX の文字だけを入れ、表示は KaTeX で作る。Markdown では $...$ と $$...$$ と往復する。

import { mergeAttributes, Node, nodeInputRule, NodeViewWrapper, type ReactNodeViewProps, ReactNodeViewRenderer } from "@tiptap/react";
import { useEffect, useRef, useState } from "react";
import { translate } from "../i18n/translate";
import { isImeKeyEvent } from "../shared/imeKeyEvent";
import { loadMathRenderer } from "./mathRenderer";

export const INLINE_MATH_NODE = "inlineMath";
export const BLOCK_MATH_NODE = "blockMath";

// 行の中の数式の書き方（$x^2$）。金額の「$5 と $6」を数式にしないよう、$ のすぐ内側に空白があるものは数式にしない。
const INLINE_MATH_SOURCE = String.raw`\$([^\s$](?:[^$\n]*[^\s$])?)\$`;
const INLINE_MATH_AT_START = new RegExp(`^${INLINE_MATH_SOURCE}`);
// 打っている途中の変換。直前が $ のとき（$$ の途中）は変換しない。
const INLINE_MATH_TYPED = new RegExp(`(?:^|[^$])(${INLINE_MATH_SOURCE})$`);
const BLOCK_MATH_AT_START = /^\$\$[ \t]*\n?([\s\S]+?)\n?[ \t]*\$\$[ \t]*(?:\n|$)/;
const MATH_INPUT_CLASS = "math-input";

function useRenderedMath(latex: string, displayMode: boolean): string | null {
  const [html, setHtml] = useState<string | null>(null);
  useEffect(() => {
    let current = true;
    void loadMathRenderer().then((render) => current && setHtml(render(latex, displayMode)));
    return () => { current = false; };
  }, [latex, displayMode]);
  return html;
}

function MathView({ node, updateAttributes, editor, selected }: ReactNodeViewProps) {
  const displayMode = node.type.name === BLOCK_MATH_NODE;
  const latex = String(node.attrs.latex ?? "");
  // 中身が空の数式（入れた直後）は、すぐ書けるように編集の欄を開いておく。
  const [editing, setEditing] = useState(latex === "");
  const [draft, setDraft] = useState(latex);
  const input = useRef<HTMLTextAreaElement>(null);
  const html = useRenderedMath(latex, displayMode);
  useEffect(() => {
    if (editing) {
      input.current?.focus();
    }
  }, [editing]);
  const commit = () => {
    setEditing(false);
    updateAttributes({ latex: draft.trim() });
  };
  const startEditing = () => {
    if (editor.isEditable) {
      setDraft(latex);
      setEditing(true);
    }
  };
  const Wrapper = displayMode ? "div" : "span";
  return (
    <NodeViewWrapper as={Wrapper} className={`math ${displayMode ? "math-block" : "math-inline"}${selected ? " selected" : ""}`} contentEditable={false}>
      {editing && editor.isEditable ? (
        <textarea ref={input} className={MATH_INPUT_CLASS} rows={displayMode ? 3 : 1} value={draft} placeholder={translate("editor.mathPlaceholder")}
          aria-label={translate("editor.math")} spellCheck={false} onChange={(event) => setDraft(event.target.value)} onBlur={commit}
          onKeyDown={(event) => {
            if (isImeKeyEvent(event.nativeEvent)) {
              return;
            }
            // 行の中の数式は Enter で、独立した行の数式は Ctrl+Enter で決める（中で改行できるように）。
            if (event.key === "Escape" || (event.key === "Enter" && (!displayMode || event.ctrlKey || event.metaKey))) {
              event.preventDefault();
              commit();
              editor.commands.focus();
            }
          }} />
      ) : html === null ? (
        // 表示の部品の読み込みが済むまでは、LaTeX の文字を出す。
        <Wrapper className="math-rendered" role="button" title={latex} onClick={startEditing}>{latex || translate("editor.mathPlaceholder")}</Wrapper>
      ) : (
        // KaTeX が作った HTML（スクリプトや外への参照を含まない）を、そのまま入れる。
        <Wrapper className="math-rendered" role="button" title={latex} onClick={startEditing} dangerouslySetInnerHTML={{ __html: html }} />
      )}
    </NodeViewWrapper>
  );
}

// 入力欄の中のキーや選択を、エディタに渡さない（渡すと、WebKit では打った文字が本文に入る）。
function mathNodeView() {
  return ReactNodeViewRenderer(MathView, {
    stopEvent: ({ event }) => (event.target as HTMLElement | null)?.classList?.contains(MATH_INPUT_CLASS) ?? false,
  });
}

function latexAttribute(dataAttribute: string) {
  return {
    latex: {
      default: "",
      parseHTML: (element: HTMLElement) => element.getAttribute(dataAttribute) ?? "",
      renderHTML: (attributes: Record<string, unknown>) => ({ [dataAttribute]: String(attributes.latex ?? "") }),
    },
  };
}

export const InlineMath = Node.create({
  name: INLINE_MATH_NODE,
  group: "inline",
  inline: true,
  atom: true,
  addAttributes() {
    return latexAttribute("data-inline-math");
  },
  parseHTML() {
    return [{ tag: "span[data-inline-math]" }];
  },
  renderHTML({ HTMLAttributes, node }) {
    return ["span", mergeAttributes(HTMLAttributes), String(node.attrs.latex ?? "")];
  },
  addNodeView: mathNodeView,
  addInputRules() {
    return [nodeInputRule({ find: INLINE_MATH_TYPED, type: this.type, getAttributes: (match) => ({ latex: match[2] }) })];
  },
  renderMarkdown: (node) => `$${String(node.attrs?.latex ?? "")}$`,
  parseMarkdown: (token) => ({ type: INLINE_MATH_NODE, attrs: { latex: String(token.text ?? "") } }),
  markdownTokenizer: {
    name: INLINE_MATH_NODE,
    level: "inline",
    start: (source: string) => source.indexOf("$"),
    tokenize(source) {
      const match = INLINE_MATH_AT_START.exec(source);
      return match ? { type: INLINE_MATH_NODE, raw: match[0], text: match[1] ?? "" } : undefined;
    },
  },
});

export const BlockMath = Node.create({
  name: BLOCK_MATH_NODE,
  group: "block",
  atom: true,
  addAttributes() {
    return latexAttribute("data-block-math");
  },
  parseHTML() {
    return [{ tag: "div[data-block-math]" }];
  },
  renderHTML({ HTMLAttributes, node }) {
    return ["div", mergeAttributes(HTMLAttributes), String(node.attrs.latex ?? "")];
  },
  addNodeView: mathNodeView,
  renderMarkdown: (node) => ["$$", String(node.attrs?.latex ?? ""), "$$"].join("\n"),
  parseMarkdown: (token) => ({ type: BLOCK_MATH_NODE, attrs: { latex: String(token.text ?? "") } }),
  markdownTokenizer: {
    name: BLOCK_MATH_NODE,
    level: "block",
    start: (source: string) => source.indexOf("$$"),
    tokenize(source) {
      const match = BLOCK_MATH_AT_START.exec(source);
      return match ? { type: BLOCK_MATH_NODE, raw: match[0], text: (match[1] ?? "").trim() } : undefined;
    },
  },
});
