// メモの本文（Yjs の XmlFragment）と Markdown の変換。変換そのものは Tiptap の Markdown の拡張に任せ、
// ここでは Markdown に無いもの（添付、メモ同士のリンク）の表し方だけを決める。
//
//   写真       ![名前](添付のパス)
//   ファイル   [名前](添付のパス) だけの段落
//   メモへのリンク  [タイトル](sedum-note://note/<メモの ID>)。ブロックを指すなら、後ろに #<ブロックの ID>
//   ブロックの ID   行の末尾の「 ^ID」（blockIdMarks.ts）
//   ブロックの埋め込み  ![タイトル](sedum-note://note/<メモの ID>#<ブロックの ID>) だけの段落

import { type JSONContent, Node } from "@tiptap/core";
import { MarkdownManager } from "@tiptap/markdown";
import { prosemirrorJSONToYXmlFragment, yXmlFragmentToProsemirrorJSON } from "@tiptap/y-tiptap";
import type * as Y from "yjs";
import { ATTACHMENT_FILE_NODE, ATTACHMENT_IMAGE_NODE, BLOCK_EMBED_NODE, NOTE_LINK_NODE } from "../../core/notes/bodyText";
import { isRandomId } from "../../core/crypto/randomId";
import { isBlockId } from "../../core/notes/bodyBlocks";
import { withBlockIdMarks, withImportedBlockIds } from "./blockIdMarks";
import { documentSchema } from "../editor/documentSchema";
import { documentExtensions } from "../editor/editorExtensions";
import { decodeMarkdownPath } from "./markdownFileNames";
import { withoutMergedCells } from "./unmergedTable";
import { calloutFromBlockquote } from "../editor/calloutNode";
import { drawingFromCodeBlock } from "../editor/drawingNode";
import { noteQueryFromCodeBlock } from "../editor/noteQueryNode";
import { ImportedFootnoteDefinition, withFootnoteNumbers, withImportedFootnoteTexts } from "../editor/footnoteNode";

const NOTE_LINK_HREF_PREFIX = "sedum-note://note/";
// メモへのリンクの中で、メモの ID とブロックの ID を分ける字。
const BLOCK_ID_SEPARATOR = "#";
// Markdown の画像を読んだ直後の仮のノード。添付にするかリンクにするかを決めて、本文に入る前に置き換える。
const IMPORTED_IMAGE_NODE = "importedMarkdownImage";

const ImportedMarkdownImage = Node.create({
  name: IMPORTED_IMAGE_NODE,
  group: "inline",
  inline: true,
  atom: true,
  markdownTokenName: "image",
  parseMarkdown: (token) => ({ type: IMPORTED_IMAGE_NODE, attrs: { href: String(token.href ?? ""), label: String(token.text ?? "") } }),
});

function escapeLinkLabel(label: string): string {
  return label.replace(/[\\[\]]/g, (character) => `\\${character}`);
}

// メモ（ブロックを指すなら、そのブロック）へのリンクの、Markdown での形。
function noteLinkMarkdown(node: JSONContent): string {
  const blockPart = isBlockId(node.attrs?.blockId) ? BLOCK_ID_SEPARATOR + node.attrs.blockId : "";
  return `[${escapeLinkLabel(String(node.attrs?.exportTitle ?? ""))}](${NOTE_LINK_HREF_PREFIX}${node.attrs?.noteId}${blockPart})`;
}

// Markdown のリンク先が、このメモ帳にあるメモ（とブロック）を指していれば、その ID。違えば null。
function noteReferenceOf(href: string, context: MarkdownImportContext): { noteId: string; blockId: string | null } | null {
  if (!href.startsWith(NOTE_LINK_HREF_PREFIX)) {
    return null;
  }
  const [noteId = "", blockId] = href.slice(NOTE_LINK_HREF_PREFIX.length).split(BLOCK_ID_SEPARATOR);
  return isRandomId(noteId) && context.noteExists(noteId) ? { noteId, blockId: isBlockId(blockId) ? blockId : null } : null;
}

// 書き出すときだけ付ける属性（exportPath は添付のリンク先、exportTitle はリンク先のメモのタイトル）を読んで、Markdown の形にする。
const markdownRenderers: Record<string, (node: JSONContent) => string> = {
  [ATTACHMENT_IMAGE_NODE]: (node) => `![${escapeLinkLabel(String(node.attrs?.fileName ?? ""))}](${node.attrs?.exportPath})`,
  [ATTACHMENT_FILE_NODE]: (node) => `[${escapeLinkLabel(String(node.attrs?.fileName ?? ""))}](${node.attrs?.exportPath})`,
  [NOTE_LINK_NODE]: noteLinkMarkdown,
  // 埋め込みは、画像と同じ「!」付きのリンクで書く（ほかのメモの中身をその場に出す、という意味をそろえる）。
  [BLOCK_EMBED_NODE]: (node) => `!${noteLinkMarkdown(node)}`,
};

let manager: MarkdownManager | null = null;

// 拡張の組み立ては重いので、最初に使うときに 1 回だけ行う。
function markdownManager(): MarkdownManager {
  if (manager === null) {
    const withRenderers = documentExtensions().map((extension) => {
      const renderMarkdown = markdownRenderers[extension.name];
      return renderMarkdown ? (extension as Node).extend({ renderMarkdown }) : extension;
    });
    manager = new MarkdownManager({ extensions: [...withRenderers, ImportedMarkdownImage, ImportedFootnoteDefinition] });
  }
  return manager;
}

// 添付を ID で指す書き方。ファイルに書き出さずに本文をやり取りするとき（MCP）に使う。
export const ATTACHMENT_HREF_PREFIX = "sedum-note://attachment/";

export type BodyExportContext = {
  // 添付を指すリンク先（書き出すものにそのまま書く形）。ファイルへ書き出すなら相対パス、MCP なら ID を指す URL。
  attachmentHref: (attachment: { id: string; fileName: string }) => string;
  // リンク先のメモの今のタイトル。メモが無ければ null。
  noteTitle: (noteId: string) => string | null;
};

// 本文を、書き出し用の文書にする。添付にはリンク先（exportPath）、メモへのリンクにはリンク先のタイトル（exportTitle）を付ける。
export function bodyToExportDocument(body: Y.XmlFragment, context: BodyExportContext): JSONContent {
  return documentToExportDocument(yXmlFragmentToProsemirrorJSON(body) as JSONContent, context);
}

// エディタの文書（ProseMirror の JSON）を、書き出し用の文書にする（bodyToExportDocument と同じ）。
function documentToExportDocument(document: JSONContent, context: BodyExportContext): JSONContent {
  return mapNodes(document, (node) => {
    if (node.type === ATTACHMENT_IMAGE_NODE || node.type === ATTACHMENT_FILE_NODE) {
      const href = context.attachmentHref({ id: String(node.attrs?.attachmentId), fileName: String(node.attrs?.fileName ?? "") });
      return [{ ...node, attrs: { ...node.attrs, exportPath: href } }];
    }
    if (node.type === NOTE_LINK_NODE || node.type === BLOCK_EMBED_NODE) {
      const title = context.noteTitle(String(node.attrs?.noteId));
      // 先のメモが消えているリンクと埋め込みは、書き出すものが無い。
      return title === null ? [] : [{ ...node, attrs: { ...node.attrs, exportTitle: title } }];
    }
    return [node];
  });
}

export function bodyToMarkdown(body: Y.XmlFragment, context: BodyExportContext): string {
  return exportDocumentToMarkdown(bodyToExportDocument(body, context));
}

// エディタの文書の一番上のブロックを、1 つずつ Markdown にする。2 つの文書をブロックごとに比べるのに使う
// （AI の直しの差分）。脚注の番号は、ブロックごとに 1 から振る。
export function documentBlocksToMarkdown(document: JSONContent, context: BodyExportContext): string[] {
  const exported = documentToExportDocument(document, context);
  return (exported.content ?? []).map((block) => exportDocumentToMarkdown({ type: "doc", content: [block] }));
}

// 文書の一番上のブロックごとの Markdown。書き出すものが無いブロック（先のメモが消えた埋め込みなど）は null にして、
// 並びの位置を本文のブロックとそろえたままにする（本文の差分で、どのブロックを入れ替えるかを位置で決めるため）。
export function documentBlockMarkdowns(document: JSONContent, context: BodyExportContext): Array<string | null> {
  return (document.content ?? []).map((block) => {
    const exported = documentToExportDocument({ type: "doc", content: [block] }, context);
    return (exported.content ?? []).length === 0 ? null : exportDocumentToMarkdown(exported);
  });
}

function exportDocumentToMarkdown(exported: JSONContent): string {
  // 脚注は、印に出てくる順の番号を付け、文を末尾に並べる。
  const { document, texts: footnoteTexts } = withFootnoteNumbers(exported);
  // Markdown の表は結合を表せないので、結合を解いてから書き出す。
  const markdown = markdownManager().serialize(withBlockIdMarks(mapNodes(document, (node) => [node.type === "table" ? withoutMergedCells(node) : node])));
  const footnoteLines = footnoteTexts.map((text, index) => `[^${index + 1}]: ${text}`);
  return footnoteLines.length === 0 ? markdown : `${markdown}\n\n${footnoteLines.join("\n")}`;
}

export type ImportedAttachment = { attachmentId: string; fileName: string; mimeType: string; byteLength: number };

export type MarkdownImportContext = {
  // Markdown の中のリンク先（相対パスか、添付を ID で指す URL）が指すものを添付にする。当たるものが無ければ null。
  attachFile: (href: string) => Promise<ImportedAttachment | null>;
  noteExists: (noteId: string) => boolean;
};

// 行の末尾の、ブロックの ID の印の扱い。keep は ID をブロックに付ける（本文を丸ごと入れるとき）。
// drop は捨てる（今ある本文に足すとき。同じ ID のブロックを増やさない）。
export type ImportedBlockIds = "keep" | "drop";

// Markdown を、本文に入れられるブロックの並びにする。
export async function markdownToBodyBlocks(markdown: string, context: MarkdownImportContext, blockIds: ImportedBlockIds): Promise<JSONContent[]> {
  const imported = await replaceImportedNodes(withImportedFootnoteTexts(markdownManager().parse(markdown)), context);
  const parsed = withImportedBlockIds(imported, blockIds === "keep");
  // コードの囲みのうち、言語がこのアプリのもの（クエリ、手書き）は、そのブロックにする。当たらなければコードのまま返る。
  return mapNodes(parsed, (node) => [node.type === "blockquote" ? calloutFromBlockquote(node) : node.type === "codeBlock" ? drawingFromCodeBlock(noteQueryFromCodeBlock(node)) : node]).content ?? [];
}

// Markdown を本文に入れる。本文は空にしてから入れる。
export async function writeMarkdownToBody(markdown: string, body: Y.XmlFragment, context: MarkdownImportContext, blockIds: ImportedBlockIds = "keep"): Promise<void> {
  const blocks = await markdownToBodyBlocks(markdown, context, blockIds);
  // 本文は空にしない。空のままだと、開いたデバイスごとにエディタが段落を足し、マージで空の段落が重なる。
  const document = { type: "doc", content: blocks.length > 0 ? blocks : [{ type: "paragraph" }] };
  body.delete(0, body.length);
  prosemirrorJSONToYXmlFragment(documentSchema(), document, body);
}

function mapNodes(node: JSONContent, replace: (node: JSONContent) => JSONContent[]): JSONContent {
  if (!node.content) {
    return node;
  }
  return { ...node, content: node.content.flatMap((child) => replace(mapNodes(child, replace))) };
}

// 添付になりうるリンク先か（一緒に渡されたファイルを指す相対パスか、添付を ID で指す URL）。
function mayPointToAttachment(href: string): boolean {
  const isRelative = href !== "" && !/^[a-z][a-z0-9+.-]*:/i.test(href) && !href.startsWith("/") && !href.startsWith("#");
  return isRelative || href.startsWith(ATTACHMENT_HREF_PREFIX);
}

function linkHrefOf(node: JSONContent): string | null {
  const link = node.marks?.find((mark) => mark.type === "link");
  return link ? String(link.attrs?.href ?? "") : null;
}

function attachmentNode(attachment: ImportedAttachment): JSONContent {
  return { type: attachment.mimeType.startsWith("image/") ? ATTACHMENT_IMAGE_NODE : ATTACHMENT_FILE_NODE, attrs: attachment };
}

// 画像は、外の URL なら読み込まずにリンクの文字にする（開いただけで外へ通信しないため）。
function imageAsLinkText(image: JSONContent): JSONContent {
  const href = String(image.attrs?.href ?? "");
  return { type: "text", text: String(image.attrs?.label || href), marks: [{ type: "link", attrs: { href } }] };
}

// 読んだ直後の文書の、仮の画像・添付へのリンク・メモへのリンクを、本文のノードに置き換える。
async function replaceImportedNodes(node: JSONContent, context: MarkdownImportContext): Promise<JSONContent> {
  if (!node.content) {
    return node;
  }
  const content: JSONContent[] = [];
  for (const child of node.content) {
    // 画像だけの行は、段落に包まれずに届く。段落の中の画像と同じ扱いにする。
    const block = child.type === IMPORTED_IMAGE_NODE ? { type: "paragraph", content: [child] } : child;
    content.push(...(block.type === "paragraph"
      ? await splitParagraphAtAttachments(block, context)
      : [await replaceImportedNodes(await replaceInlineNodes(block, context), context)]));
  }
  return { ...node, content };
}

// 段落の中の画像と、添付へのリンクだけの段落を、添付のノード（ブロック）にする。前後の文字は別の段落に分ける。
async function splitParagraphAtAttachments(paragraph: JSONContent, context: MarkdownImportContext): Promise<JSONContent[]> {
  const inlineNodes = paragraph.content ?? [];
  // このメモ帳のブロックを指す画像だけの段落は、ブロックの埋め込み。
  const onlyImageHref = inlineNodes.length === 1 && inlineNodes[0]?.type === IMPORTED_IMAGE_NODE ? String(inlineNodes[0].attrs?.href ?? "") : null;
  const embedded = onlyImageHref === null ? null : noteReferenceOf(onlyImageHref, context);
  if (embedded && embedded.blockId !== null) {
    return [{ type: BLOCK_EMBED_NODE, attrs: embedded }];
  }
  const onlyLinkHref = inlineNodes.length === 1 && inlineNodes[0] ? linkHrefOf(inlineNodes[0]) : null;
  if (onlyLinkHref !== null && mayPointToAttachment(onlyLinkHref)) {
    const attachment = await context.attachFile(decodeMarkdownPath(onlyLinkHref));
    if (attachment) {
      return [attachmentNode(attachment)];
    }
  }
  const blocks: JSONContent[] = [];
  let run: JSONContent[] = [];
  const closeRun = () => {
    const trimmed = withoutEdgeSpaces(run);
    if (trimmed.length > 0) {
      blocks.push({ ...paragraph, content: trimmed });
    }
    run = [];
  };
  for (const inlineNode of inlineNodes) {
    const href = inlineNode.type === IMPORTED_IMAGE_NODE ? String(inlineNode.attrs?.href ?? "") : null;
    const attachment = href !== null && mayPointToAttachment(href) ? await context.attachFile(decodeMarkdownPath(href)) : null;
    if (attachment) {
      closeRun();
      blocks.push(attachmentNode(attachment));
    } else {
      run.push(replaceInlineNode(inlineNode, context));
    }
  }
  closeRun();
  return blocks.length > 0 ? blocks : [{ ...paragraph, content: undefined }];
}

// 添付で分けた段落の端に残る空白を落とす。空白だけになった文字は捨てる。
function withoutEdgeSpaces(inlineNodes: JSONContent[]): JSONContent[] {
  const trimmed = inlineNodes.map((inlineNode, index) => {
    if (inlineNode.type !== "text" || typeof inlineNode.text !== "string") {
      return inlineNode;
    }
    let text = inlineNode.text;
    if (index === 0) {
      text = text.trimStart();
    }
    if (index === inlineNodes.length - 1) {
      text = text.trimEnd();
    }
    return { ...inlineNode, text };
  });
  return trimmed.filter((inlineNode) => inlineNode.type !== "text" || inlineNode.text !== "");
}

// 見出しなど、ブロックを入れられない所の中身を置き換える。
async function replaceInlineNodes(node: JSONContent, context: MarkdownImportContext): Promise<JSONContent> {
  if (node.type !== "heading" || !node.content) {
    return node;
  }
  return { ...node, content: node.content.map((inlineNode) => replaceInlineNode(inlineNode, context)) };
}

function replaceInlineNode(inlineNode: JSONContent, context: MarkdownImportContext): JSONContent {
  if (inlineNode.type === IMPORTED_IMAGE_NODE) {
    return imageAsLinkText(inlineNode);
  }
  const href = linkHrefOf(inlineNode);
  if (href?.startsWith(NOTE_LINK_HREF_PREFIX)) {
    const linked = noteReferenceOf(href, context);
    if (linked) {
      return { type: NOTE_LINK_NODE, attrs: linked };
    }
    // リンク先がこのメモ帳に無ければ、文字だけを残す。
    return { ...inlineNode, marks: inlineNode.marks?.filter((mark) => mark.type !== "link") };
  }
  return inlineNode;
}
