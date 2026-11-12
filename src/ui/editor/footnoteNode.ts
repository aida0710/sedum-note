// 脚注。本文には脚注の印（番号）を置き、脚注の文は印のノードが持つ。番号は、本文に出てくる順に画面が付ける。
// 脚注の文の一覧は、本文の下に出す（NoteFootnotes）。Markdown では、[^1] の印と、末尾の [^1]: 文 の形と往復する。

import { type JSONContent, Node } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin } from "@tiptap/pm/state";

export const FOOTNOTE_NODE = "footnoteReference";
// Markdown から読んだ直後の、脚注の文（[^1]: 文）の仮のノード。印に文を移して、本文に入る前に消す。
const IMPORTED_DEFINITION_NODE = "importedFootnoteDefinition";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    footnote: {
      // カーソルの所に、文の空の脚注の印を入れる。文は、本文の下の一覧で書く。
      insertFootnote: () => ReturnType;
    };
  }
}

export type Footnote = { position: number; text: string };

// 本文の中の脚注を、出てくる順に並べる。
export function footnotesOf(doc: ProseMirrorNode): Footnote[] {
  const footnotes: Footnote[] = [];
  doc.descendants((node, position) => {
    if (node.type.name === FOOTNOTE_NODE) {
      footnotes.push({ position, text: String(node.attrs.text ?? "") });
    }
    return true;
  });
  return footnotes;
}

// 脚注の文の入力欄の id。印を押したときに、その欄へ移るのに使う。
export function footnoteInputId(index: number): string {
  return `footnote-text-${index}`;
}

export const FootnoteReference = Node.create({
  name: FOOTNOTE_NODE,
  group: "inline",
  inline: true,
  atom: true,
  addAttributes() {
    return {
      text: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-footnote") ?? "",
        renderHTML: (attributes) => ({ "data-footnote": String(attributes.text ?? ""), title: String(attributes.text ?? "") }),
      },
    };
  },
  parseHTML() {
    return [{ tag: "sup[data-footnote]" }];
  },
  renderHTML({ HTMLAttributes }) {
    // 番号は、スタイルのカウンターで、出てくる順に付ける。
    return ["sup", { ...HTMLAttributes, class: "footnote-reference" }];
  },
  addCommands() {
    return {
      insertFootnote: () => ({ commands }) => commands.insertContent({ type: FOOTNOTE_NODE }),
    };
  },
  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          // 印を押すと、本文の下の、その脚注の文の欄へ移る。
          handleClickOn: (view, _position, node, nodePosition) => {
            if (node.type.name !== FOOTNOTE_NODE) {
              return false;
            }
            const index = footnotesOf(view.state.doc).findIndex((footnote) => footnote.position === nodePosition);
            document.getElementById(footnoteInputId(index))?.focus();
            return true;
          },
        },
      }),
    ];
  },
  // 書き出すときの番号（exportNumber）は、書き出す側が出てくる順に付ける。
  renderMarkdown: (node) => `[^${String(node.attrs?.exportNumber ?? "")}]`,
  parseMarkdown: (token) => ({ type: FOOTNOTE_NODE, attrs: { importedLabel: String(token.label ?? "") } }),
  markdownTokenizer: {
    name: FOOTNOTE_NODE,
    level: "inline",
    start: (source: string) => source.indexOf("[^"),
    tokenize(source) {
      const match = /^\[\^([^\]\s]+)\]/.exec(source);
      return match ? { type: FOOTNOTE_NODE, raw: match[0], label: match[1] } : undefined;
    },
  },
});

export const ImportedFootnoteDefinition = Node.create({
  name: IMPORTED_DEFINITION_NODE,
  group: "block",
  atom: true,
  markdownTokenName: IMPORTED_DEFINITION_NODE,
  parseMarkdown: (token) => ({ type: IMPORTED_DEFINITION_NODE, attrs: { label: String(token.label ?? ""), text: String(token.text ?? "") } }),
  markdownTokenizer: {
    name: IMPORTED_DEFINITION_NODE,
    level: "block",
    start: (source: string) => source.search(/^\[\^[^\]\s]+\]:/m),
    tokenize(source) {
      const match = /^\[\^([^\]\s]+)\]:[ \t]*([^\n]*)(?:\n|$)/.exec(source);
      return match ? { type: IMPORTED_DEFINITION_NODE, raw: match[0], label: match[1], text: (match[2] ?? "").trim() } : undefined;
    },
  },
});

// Markdown から読んだ直後の文書で、脚注の文（仮のノード）を、同じラベルの印へ移す。仮のノードは消す。
export function withImportedFootnoteTexts(document: JSONContent): JSONContent {
  const textsByLabel = new Map<string, string>();
  const collect = (node: JSONContent) => {
    if (node.type === IMPORTED_DEFINITION_NODE) {
      textsByLabel.set(String(node.attrs?.label ?? ""), String(node.attrs?.text ?? ""));
    }
    node.content?.forEach(collect);
  };
  collect(document);
  const resolve = (node: JSONContent): JSONContent[] => {
    if (node.type === IMPORTED_DEFINITION_NODE) {
      return [];
    }
    if (node.type === FOOTNOTE_NODE) {
      return [{ type: FOOTNOTE_NODE, attrs: { text: textsByLabel.get(String(node.attrs?.importedLabel ?? "")) ?? "" } }];
    }
    return [node.content ? { ...node, content: node.content.flatMap(resolve) } : node];
  };
  return resolve(document)[0] ?? document;
}

// 書き出す前の文書で、脚注の印に、出てくる順の番号を付ける。脚注の文を、番号の順に返す。
export function withFootnoteNumbers(document: JSONContent): { document: JSONContent; texts: string[] } {
  const texts: string[] = [];
  const number = (node: JSONContent): JSONContent => {
    if (node.type === FOOTNOTE_NODE) {
      texts.push(String(node.attrs?.text ?? ""));
      return { ...node, attrs: { ...node.attrs, exportNumber: texts.length } };
    }
    return node.content ? { ...node, content: node.content.map(number) } : node;
  };
  return { document: number(document), texts };
}
