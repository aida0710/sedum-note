// エディタ（Tiptap）の文書の JSON から、一覧の要約・検索・タグに使う平文を取り出す。

type DocumentNode = { type?: unknown; text?: unknown; content?: unknown };

// 段落や見出しなど、前後で改行にするブロックの種類。
const BLOCK_TYPES = new Set(["paragraph", "heading", "listItem", "taskItem", "blockquote", "codeBlock"]);

export function documentPlainText(document: unknown): string {
  const parts: string[] = [];
  collectText(document, parts);
  return parts.join("").replace(/\n{2,}/g, "\n").trim();
}

function collectText(node: unknown, parts: string[]): void {
  if (typeof node !== "object" || node === null) {
    return;
  }
  const { type, text, content } = node as DocumentNode;
  if (typeof text === "string") {
    parts.push(text);
  }
  if (Array.isArray(content)) {
    for (const child of content) {
      collectText(child, parts);
    }
  }
  if (typeof type === "string" && BLOCK_TYPES.has(type)) {
    parts.push("\n");
  }
}

// UpNote と同じく、本文の「#言葉」をタグとして扱う。見出しの記号と区別するため、
// # の直後に空白を置かないものだけを拾う。
const HASHTAG_PATTERN = /(?:^|[\s　(（])#([\p{L}\p{N}_\-/]+)/gu;

export function documentHashtags(text: string): string[] {
  const tags = new Set<string>();
  for (const match of text.matchAll(HASHTAG_PATTERN)) {
    if (match[1]) {
      tags.add(match[1]);
    }
  }
  return [...tags];
}
