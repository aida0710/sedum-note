// 撮った画面を、ドキュメントの画像（pages/public/images/<名前>.webp）として保存する。
// 画面は 2 倍の解像度で撮るので、PNG のままだとリポジトリが重くなる。依存を足さずに、ブラウザの canvas で WebP にする。

import { mkdir, writeFile } from "node:fs/promises";

export const DOCS_IMAGE_DIRECTORY = new URL("../../pages/public/images/", import.meta.url);
// 画面の文字がにじまず、PNG の 4 分の 1 ほどの大きさになる値。
const WEBP_QUALITY = 0.9;

export async function createImageWriter(browser) {
  await mkdir(DOCS_IMAGE_DIRECTORY, { recursive: true });
  const converter = await (await browser.newContext()).newPage();
  const written = [];
  return {
    written,
    async save(name, png) {
      const webpBase64 = await converter.evaluate(async ({ base64, quality }) => {
        const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${base64}`)).blob());
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
        canvas.getContext("2d").drawImage(bitmap, 0, 0);
        const bytes = new Uint8Array(await (await canvas.convertToBlob({ type: "image/webp", quality })).arrayBuffer());
        let binary = "";
        for (const byte of bytes) binary += String.fromCharCode(byte);
        return btoa(binary);
      }, { base64: png.toString("base64"), quality: WEBP_QUALITY });
      const path = new URL(`${name}.webp`, DOCS_IMAGE_DIRECTORY);
      await writeFile(path, Buffer.from(webpBase64, "base64"));
      written.push(path.pathname);
    },
  };
}
