// 書式の無い文字（Markdown でもないもの）を貼り付けたときの、段落への分け方。
// 1 行を 1 つの段落にし、空の行は空の段落として残す。エディタの既定では、続いた改行を 1 つにまとめるので、空の行が消える。

import { Fragment, type ResolvedPos, Slice } from "@tiptap/pm/model";

// 貼る中身の両端を 1 段開いておく（最初と最後の行を、今の行の文字につなげるため）。
const OPEN_PARAGRAPH_DEPTH = 1;

export function plainTextSlice(text: string, $context: ResolvedPos): Slice {
  const { schema } = $context.doc.type;
  const paragraphType = schema.nodes.paragraph;
  const marks = $context.marks();
  // 段落の無い文書の形（このアプリには無い）なら、文字のまま入れる。
  if (!paragraphType) {
    return new Slice(Fragment.from(schema.text(text, marks)), 0, 0);
  }
  // 末尾の改行は、空の段落を足さない。
  const lines = text.replace(/(?:\r\n?|\n)+$/, "").split(/\r\n?|\n/);
  const paragraphs = lines.map((line) => paragraphType.create(null, line === "" ? null : schema.text(line, marks)));
  return new Slice(Fragment.from(paragraphs), OPEN_PARAGRAPH_DEPTH, OPEN_PARAGRAPH_DEPTH);
}
