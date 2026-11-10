// ListObjectsV2 の応答（XML）から、キー・ETag・続きの印を取り出す。
//
// DOMParser は Web Worker と Node に無いので使わない。このアプリが置くキーは
// 16 進の ID と決まった名前だけなので、要素を素直に拾えば足りる。

import type { ObjectSummary } from "./objectStore";
import { normalizeEtag } from "./objectStore";

export type ListObjectsPage = {
  objects: ObjectSummary[];
  // 続きがあるときだけ値がある。
  nextContinuationToken: string | null;
};

const XML_ENTITIES: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'" };

// SeaweedFS は ETag の引用符を &#34; の形（数値の文字参照）で返すので、名前付きの
// 参照と数値の参照の両方を戻す。
function decodeXmlText(text: string): string {
  return text.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|amp|lt|gt|quot|apos);/g, (entity, body: string) => {
    if (body.startsWith("#x")) {
      return String.fromCodePoint(Number.parseInt(body.slice(2), 16));
    }
    if (body.startsWith("#")) {
      return String.fromCodePoint(Number.parseInt(body.slice(1), 10));
    }
    return XML_ENTITIES[entity] ?? entity;
  });
}

function firstElementText(xml: string, name: string): string | null {
  const match = new RegExp(`<${name}>([\\s\\S]*?)</${name}>`).exec(xml);
  return match?.[1] === undefined ? null : decodeXmlText(match[1]);
}

export function parseListObjectsPage(xml: string): ListObjectsPage {
  const objects: ObjectSummary[] = [];
  for (const match of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
    const contents = match[1] ?? "";
    const key = firstElementText(contents, "Key");
    const etag = firstElementText(contents, "ETag");
    if (key !== null && etag !== null) {
      objects.push({ key, etag: normalizeEtag(etag) });
    }
  }
  const isTruncated = firstElementText(xml, "IsTruncated") === "true";
  return { objects, nextContinuationToken: isTruncated ? firstElementText(xml, "NextContinuationToken") : null };
}
