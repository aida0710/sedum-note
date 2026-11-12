// メモの本文（Yjs の XmlFragment）を HTML にする。書式は Tiptap の HTML の出力に任せ、
// ここでは HTML に無いもの（添付、メモ同士のリンク）の表し方だけを決める。
//
//   写真       <img src="添付のパス">
//   ファイル   <a href="添付のパス">名前</a>
//   メモへのリンク  リンク先のメモのタイトル（文字だけ）
//   ブロックの埋め込み  元のメモのタイトル（文字だけの段落）

import { generateHTML, type JSONContent, type Node } from "@tiptap/core";
import type * as Y from "yjs";
import { ATTACHMENT_FILE_NODE, ATTACHMENT_IMAGE_NODE, BLOCK_EMBED_NODE, NOTE_LINK_NODE } from "../../core/notes/bodyText";
import { documentExtensions } from "../editor/editorExtensions";
import { bodyToExportDocument, type BodyExportContext } from "./markdownDocument";

type HtmlOutput = [string, Record<string, string>, ...unknown[]];

// 書き出すときだけ付ける属性（exportPath は添付のリンク先、exportTitle はリンク先のメモのタイトル）を読んで、HTML の形にする。
const htmlRenderers: Record<string, (attributes: Record<string, unknown>) => HtmlOutput> = {
  [ATTACHMENT_IMAGE_NODE]: (attributes) => ["img", { src: String(attributes.exportPath), alt: String(attributes.fileName ?? "") }],
  [ATTACHMENT_FILE_NODE]: (attributes) => ["p", {}, ["a", { href: String(attributes.exportPath) }, String(attributes.fileName ?? "")]],
  [NOTE_LINK_NODE]: (attributes) => ["span", {}, String(attributes.exportTitle ?? "")],
  [BLOCK_EMBED_NODE]: (attributes) => ["p", {}, String(attributes.exportTitle ?? "")],
};

function htmlExtensions() {
  return documentExtensions().map((extension) => {
    const render = htmlRenderers[extension.name];
    return render
      ? (extension as Node).extend({
        addAttributes() {
          return { ...this.parent?.(), exportPath: { default: null, rendered: false }, exportTitle: { default: null, rendered: false } };
        },
        renderHTML: ({ node }) => render(node.attrs) as never,
      })
      : extension;
  });
}

export function bodyToHtml(body: Y.XmlFragment, context: BodyExportContext): string {
  return generateHTML(bodyToExportDocument(body, context) as JSONContent, htmlExtensions());
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[character] ?? character);
}

// ファイルを単独で開いても読めるようにする、最小のスタイル。
const HTML_FILE_STYLE = "body{max-width:760px;margin:2em auto;padding:0 1em;font-family:sans-serif;line-height:1.7}"
  + "img{max-width:100%}table{border-collapse:collapse}th,td{border:1px solid #ccc;padding:4px 10px;vertical-align:top}"
  + "pre{background:#f3f3f1;padding:10px;border-radius:6px;overflow-x:auto}blockquote{border-left:3px solid #ccc;margin-left:0;padding-left:12px;color:#555}";

// 1 件のメモを、単独で開ける HTML のファイルにする。
export function noteAsHtmlFile(input: { title: string; bodyHtml: string; language: string }): string {
  const title = escapeHtml(input.title);
  return `<!doctype html>\n<html lang="${escapeHtml(input.language)}">\n<head>\n<meta charset="utf-8">\n<title>${title}</title>\n<style>${HTML_FILE_STYLE}</style>\n</head>\n`
    + `<body>\n<h1>${title}</h1>\n${input.bodyHtml}\n</body>\n</html>\n`;
}
