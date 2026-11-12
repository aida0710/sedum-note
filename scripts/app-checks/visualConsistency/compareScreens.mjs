// 直す前と後の画面の画像を左右に並べ、見出しを付けた 1 枚の画像にする。報告に添える比べの画像を作る道具。
//
// 使い方: node scripts/app-checks/visualConsistency/compareScreens.mjs <出力の png> <見出し> <前の png> <後の png> [<切り出す範囲 x,y,幅,高さ>]
//   切り出す範囲を渡すと、両方の画像のその範囲だけを並べる（左下の行だけ、のように小さい所を比べるとき）。

import { readFile } from "node:fs/promises";
import { chromium } from "@playwright/test";

const [outputPath, heading, beforePath, afterPath, cropArgument] = process.argv.slice(2);
if (!outputPath || !heading || !beforePath || !afterPath) {
  throw new Error("使い方: compareScreens.mjs <出力の png> <見出し> <前の png> <後の png> [x,y,幅,高さ]");
}
const crop = cropArgument ? cropArgument.split(",").map(Number) : null;
// 切り出した小さい範囲は、見やすいよう拡大して並べる。
const CROP_ZOOM = 2;

const dataUrl = async (path) => `data:image/png;base64,${(await readFile(path)).toString("base64")}`;
const picture = (url) => crop
  ? `<div class="crop" style="width:${crop[2] * CROP_ZOOM}px;height:${crop[3] * CROP_ZOOM}px"><img src="${url}" style="transform:scale(${CROP_ZOOM});left:${-crop[0] * CROP_ZOOM}px;top:${-crop[1] * CROP_ZOOM}px"></div>`
  : `<img class="whole" src="${url}">`;

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1200, height: 100 }, deviceScaleFactor: 1 })).newPage();
await page.setContent(`<style>
  body { margin: 0; padding: 20px; background: #6b7280; font-family: "Noto Sans CJK JP", sans-serif; color: #fff; display: inline-block; }
  h1 { font-size: 24px; margin: 0 0 12px; }
  .pair { display: flex; gap: 20px; align-items: flex-start; }
  figure { margin: 0; } figcaption { font-size: 18px; font-weight: 700; padding-bottom: 6px; }
  .whole { display: block; max-width: 900px; }
  .crop { position: relative; overflow: hidden; background: #fff; }
  .crop img { position: absolute; transform-origin: 0 0; }
</style><h1>${heading}</h1><div class="pair">
  <figure><figcaption>直す前</figcaption>${picture(await dataUrl(beforePath))}</figure>
  <figure><figcaption>直した後</figcaption>${picture(await dataUrl(afterPath))}</figure>
</div>`);
await page.locator("body").screenshot({ path: outputPath });
await browser.close();
