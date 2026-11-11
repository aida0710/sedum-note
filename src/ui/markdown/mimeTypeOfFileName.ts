// 取り込むファイルの種類を、名前の拡張子から決める。zip の中のファイルには種類が付いていないため。
// 画像として本文に表示するか、ファイルとして添付するかの判断に使う。

const MIME_TYPES_BY_EXTENSION: Record<string, string> = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", avif: "image/avif",
  svg: "image/svg+xml", bmp: "image/bmp", heic: "image/heic",
  pdf: "application/pdf", txt: "text/plain", csv: "text/csv", json: "application/json", zip: "application/zip",
  mp3: "audio/mpeg", m4a: "audio/mp4", wav: "audio/wav", mp4: "video/mp4", mov: "video/quicktime",
};

export function mimeTypeOfFileName(fileName: string): string {
  const extension = fileName.includes(".") ? fileName.slice(fileName.lastIndexOf(".") + 1).toLowerCase() : "";
  return MIME_TYPES_BY_EXTENSION[extension] ?? "application/octet-stream";
}
