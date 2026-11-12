// 本文（Yjs の XmlFragment）のブロックを、ほかの本文へ写す。
//
// 写しは、写した先の文書への新しい操作として入る。ブロックの属性と文字の書式（Yjs の属性と delta）をそのまま写すので、
// Markdown に無いもの（文字色、セルの背景色、列の幅、セルの結合など）も落ちない。

import * as Y from "yjs";

// source の本文のブロックを写したもの。写した先へ入れるまでは、どの文書にも属さない。
export function copyBodyBlocks(source: Y.XmlFragment): Y.XmlElement[] {
  // ProseMirror の文書の直下はブロックだけなので、本文の直下も XmlElement だけが並ぶ。
  return source.toArray().map((node) => node.clone() as Y.XmlElement);
}

// target の本文の中身を消し、source の本文の写しに入れ替える。
export function replaceBodyWithCopyOf(target: Y.XmlFragment, source: Y.XmlFragment): void {
  const blocks = copyBodyBlocks(source);
  const replace = () => {
    target.delete(0, target.length);
    // 本文は空にしない。空のままだと、開いたデバイスごとにエディタが段落を足し、マージで空の段落が重なる。
    target.insert(0, blocks.length > 0 ? blocks : [new Y.XmlElement("paragraph")]);
  };
  // 消すのと入れるのを 1 つの変更にして、途中の空の本文が保存や同期に出ないようにする。
  if (target.doc) {
    target.doc.transact(replace);
  } else {
    replace();
  }
}
