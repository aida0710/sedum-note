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

function decodeXmlText(text: string): string {
  return text.replace(/&(amp|lt|gt|quot|apos);/g, (entity) => XML_ENTITIES[entity] ?? entity);
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
