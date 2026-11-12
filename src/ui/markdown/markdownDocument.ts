// メモの本文（Yjs の XmlFragment）と Markdown の変換。変換そのものは Tiptap の Markdown の拡張に任せ、
// ここでは Markdown に無いもの（添付、メモ同士のリンク）の表し方だけを決める。
//
//   写真       ![名前](添付のパス)
//   ファイル   [名前](添付のパス) だけの段落
//   メモへのリンク  [タイトル](sedum-note://note/<メモの ID>)

import { type JSONContent, Node } from "@tiptap/core";
import { MarkdownManager } from "@tiptap/markdown";
import { prosemirrorJSONToYXmlFragment, yXmlFragmentToProsemirrorJSON } from "@tiptap/y-tiptap";
import type * as Y from "yjs";
import { ATTACHMENT_FILE_NODE, ATTACHMENT_IMAGE_NODE, NOTE_LINK_NODE } from "../../core/notes/bodyText";
import { isRandomId } from "../../core/crypto/randomId";
import { documentSchema } from "../editor/documentSchema";
import { documentExtensions, HEADING_LEVELS } from "../editor/editorExtensions";
import { decodeMarkdownPath } from "./markdownFileNames";
import { withoutMergedCells } from "./unmergedTable";

const NOTE_LINK_HREF_PREFIX = "sedum-note://note/";
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

// 書き出すときだけ付ける属性（markdownPath は添付のリンク先、markdownTitle はリンク先のメモのタイトル）を読んで、Markdown の形にする。
const markdownRenderers: Record<string, (node: JSONContent) => string> = {
  [ATTACHMENT_IMAGE_NODE]: (node) => `![${escapeLinkLabel(String(node.attrs?.fileName ?? ""))}](${node.attrs?.markdownPath})`,
  [ATTACHMENT_FILE_NODE]: (node) => `[${escapeLinkLabel(String(node.attrs?.fileName ?? ""))}](${node.attrs?.markdownPath})`,
  [NOTE_LINK_NODE]: (node) => `[${escapeLinkLabel(String(node.attrs?.markdownTitle ?? ""))}](${NOTE_LINK_HREF_PREFIX}${node.attrs?.noteId})`,
};

let manager: MarkdownManager | null = null;

// 拡張の組み立ては重いので、最初に使うときに 1 回だけ行う。
function markdownManager(): MarkdownManager {
  if (manager === null) {
    const withRenderers = documentExtensions().map((extension) => {
      const renderMarkdown = markdownRenderers[extension.name];
      return renderMarkdown ? (extension as Node).extend({ renderMarkdown }) : extension;
    });
    manager = new MarkdownManager({ extensions: [...withRenderers, ImportedMarkdownImage] });
  }
  return manager;
}

// 添付を ID で指す書き方。ファイルに書き出さずに本文をやり取りするとき（MCP）に使う。
export const ATTACHMENT_HREF_PREFIX = "sedum-note://attachment/";

export type MarkdownExportContext = {
  // 添付を指すリンク先（Markdown にそのまま書く形）。ファイルへ書き出すなら相対パス、MCP なら ID を指す URL。
  attachmentHref: (attachment: { id: string; fileName: string }) => string;
  // リンク先のメモの今のタイトル。メモが無ければ null。
  noteTitle: (noteId: string) => string | null;
};

export function bodyToMarkdown(body: Y.XmlFragment, context: MarkdownExportContext): string {
  const document = yXmlFragmentToProsemirrorJSON(body) as JSONContent;
  return markdownManager().serialize(mapNodes(document, (node) => {
    if (node.type === ATTACHMENT_IMAGE_NODE || node.type === ATTACHMENT_FILE_NODE) {
      const href = context.attachmentHref({ id: String(node.attrs?.attachmentId), fileName: String(node.attrs?.fileName ?? "") });
      return [{ ...node, attrs: { ...node.attrs, markdownPath: href } }];
    }
    if (node.type === NOTE_LINK_NODE) {
      const title = context.noteTitle(String(node.attrs?.noteId));
      // リンク先が消えているリンクは、書き出すものが無い。
      return title === null ? [] : [{ ...node, attrs: { ...node.attrs, markdownTitle: title } }];
    }
    if (node.type === "table") {
      return [withoutMergedCells(node)];
    }
    return [node];
  }));
}

export type ImportedAttachment = { attachmentId: string; fileName: string; mimeType: string; byteLength: number };

export type MarkdownImportContext = {
  // Markdown の中のリンク先（相対パスか、添付を ID で指す URL）が指すものを添付にする。当たるものが無ければ null。
  attachFile: (href: string) => Promise<ImportedAttachment | null>;
  noteExists: (noteId: string) => boolean;
};

// Markdown を、本文に入れられるブロックの並びにする。
export async function markdownToBodyBlocks(markdown: string, context: MarkdownImportContext): Promise<JSONContent[]> {
  const parsed = await replaceImportedNodes(markdownManager().parse(markdown), context);
  return mapNodes(parsed, (node) => [withSupportedHeadingLevel(node)]).content ?? [];
}

const DEEPEST_HEADING_LEVEL = Math.max(...HEADING_LEVELS);

// 本文に無い深さの見出し（####以降）は、そのままだと一番大きい見出しになってしまうので、一番深い段にする。
function withSupportedHeadingLevel(node: JSONContent): JSONContent {
  const isTooDeep = node.type === "heading" && Number(node.attrs?.level) > DEEPEST_HEADING_LEVEL;
  return isTooDeep ? { ...node, attrs: { ...node.attrs, level: DEEPEST_HEADING_LEVEL } } : node;
}

// Markdown を本文に入れる。本文は空にしてから入れる。
export async function writeMarkdownToBody(markdown: string, body: Y.XmlFragment, context: MarkdownImportContext): Promise<void> {
  const blocks = await markdownToBodyBlocks(markdown, context);
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
    const noteId = href.slice(NOTE_LINK_HREF_PREFIX.length);
    if (isRandomId(noteId) && context.noteExists(noteId)) {
      return { type: NOTE_LINK_NODE, attrs: { noteId } };
    }
    // リンク先がこのメモ帳に無ければ、文字だけを残す。
    return { ...inlineNode, marks: inlineNode.marks?.filter((mark) => mark.type !== "link") };
  }
  return inlineNode;
}
