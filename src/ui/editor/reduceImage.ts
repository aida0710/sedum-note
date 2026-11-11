// 貼る写真を小さくする。長い辺を決めた大きさまで縮め、JPEG にし直す（透過のありうる PNG は PNG のまま）。
// 縮めると、写真に付いている撮影場所などの情報（EXIF）は残らない。向きは見た目どおりに保つ。

// 縮めたあとの長い辺（px）。画面で見るのに十分で、スマホの写真（4000px 前後）がおよそ数分の 1 の大きさになる。
export const REDUCED_IMAGE_MAX_EDGE = 2048;
const JPEG_QUALITY = 0.85;
// 縮めない形式。GIF は動きが消え、SVG は大きさを持たない。
const UNREDUCED_MIME_TYPES = new Set(["image/gif", "image/svg+xml"]);

// 縮めたファイルを返す。縮めない形式・読めない形式・もう十分小さい写真・縮めても小さくならない写真は、元のまま返す。
export async function reduceImageFile(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || UNREDUCED_MIME_TYPES.has(file.type)) {
    return file;
  }
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    // この WebView が読めない形式（HEIC など）。
    return file;
  }
  try {
    const scale = REDUCED_IMAGE_MAX_EDGE / Math.max(bitmap.width, bitmap.height);
    if (scale >= 1) {
      return file;
    }
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const keepsPng = file.type === "image/png";
    const reduced = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, keepsPng ? "image/png" : "image/jpeg", JPEG_QUALITY));
    if (reduced === null || reduced.size >= file.size) {
      return file;
    }
    const name = keepsPng ? file.name : file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([reduced], name, { type: reduced.type });
  } finally {
    bitmap.close();
  }
}
