// WebDAV の PROPFIND の応答（multistatus の XML）から、フォルダの中のものの URL のパス・ETag・フォルダかどうかを取り出す。
//
// DOMParser は Web Worker と Node に無いので使わない。要素の名前の前の接頭辞（D:、d:、lp1: など）はサーバーごとに
// 違うので、接頭辞を問わずに要素を拾う。

import { normalizeEtag } from "./objectStore";

export type WebDavEntry = {
  // 応答に書かれた場所。URL 全体のサーバーも、パスだけのサーバーもあるので、パス（復号したもの）にそろえる。
  path: string;
  isCollection: boolean;
  // ファイルの ETag。フォルダや、ETag を返さないサーバーでは null。
  etag: string | null;
};

const XML_ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

function decodeXmlText(text: string): string {
  return text.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|amp|lt|gt|quot|apos);/g, (_entity, body: string) => {
    if (body.startsWith("#x")) {
      return String.fromCodePoint(Number.parseInt(body.slice(2), 16));
    }
    if (body.startsWith("#")) {
      return String.fromCodePoint(Number.parseInt(body.slice(1), 10));
    }
    return XML_ENTITIES[body] ?? "";
  });
}

// 接頭辞を問わずに、その名前の要素の中身を全部返す。
function elementContents(xml: string, name: string): string[] {
  const pattern = new RegExp(`<(?:[A-Za-z0-9_.-]+:)?${name}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[A-Za-z0-9_.-]+:)?${name}>`, "g");
  return [...xml.matchAll(pattern)].map((match) => match[1] ?? "");
}

function pathOfHref(href: string): string {
  const withoutOrigin = href.replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]+/i, "");
  try {
    return decodeURIComponent(withoutOrigin);
  } catch {
    return withoutOrigin;
  }
}

export function parseMultistatus(xml: string): WebDavEntry[] {
  return elementContents(xml, "response").flatMap((response) => {
    const [href] = elementContents(response, "href");
    if (href === undefined) {
      return [];
    }
    const [etag] = elementContents(response, "getetag");
    return [{
      path: pathOfHref(decodeXmlText(href.trim())),
      isCollection: /<(?:[A-Za-z0-9_.-]+:)?collection[\s/>]/.test(response),
      etag: etag === undefined || etag.trim() === "" ? null : normalizeEtag(decodeXmlText(etag.trim())),
    }];
  });
}
