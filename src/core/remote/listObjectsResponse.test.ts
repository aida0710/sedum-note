import { describe, expect, it } from "vitest";
import { parseListObjectsPage } from "./listObjectsResponse";

describe("parseListObjectsPage", () => {
  it("キーと引用符を外した ETag と、続きの印を取り出す", () => {
    const xml = `<?xml version="1.0"?><ListBucketResult><IsTruncated>true</IsTruncated>
      <Contents><Key>notes/records/abc</Key><ETag>&quot;d41d8&quot;</ETag></Contents>
      <Contents><Key>notes/records/def</Key><ETag>"e5f6"</ETag></Contents>
      <NextContinuationToken>token+1</NextContinuationToken></ListBucketResult>`;
    expect(parseListObjectsPage(xml)).toEqual({
      objects: [{ key: "notes/records/abc", etag: "d41d8" }, { key: "notes/records/def", etag: "e5f6" }],
      nextContinuationToken: "token+1",
    });
  });

  it("数値の文字参照で書かれた引用符も外す（SeaweedFS の形）", () => {
    const xml = "<ListBucketResult><Contents><Key>a</Key><ETag>&#34;86ab&#34;</ETag></Contents></ListBucketResult>";
    expect(parseListObjectsPage(xml).objects).toEqual([{ key: "a", etag: "86ab" }]);
  });

  it("最後のページでは続きの印を返さない", () => {
    expect(parseListObjectsPage("<ListBucketResult><IsTruncated>false</IsTruncated></ListBucketResult>")).toEqual({ objects: [], nextContinuationToken: null });
  });
});
