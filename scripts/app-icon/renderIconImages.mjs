// アプリのアイコンの元の画像を、絵（public/app-artwork.webp）から作る。手順は src-tauri/app-icon/README.md。
// public/app-icon.png（Web の favicon と画面の中のアイコン）はリポジトリに書き、tauri icon に渡す元の画像と
// manifest.json は、出力のフォルダ（1〜2MB あり、リポジトリには入れない）に書く。
// 画像の加工には、Playwright の Chromium の canvas を使う（画像を扱うライブラリを増やさないため）。
// 使い方: リポジトリの直下で node scripts/app-icon/renderIconImages.mjs <出力のフォルダ>

import { chromium } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const outputDirectory = process.argv[2];
if (!outputDirectory) {
  throw new Error("出力のフォルダを渡してください（例: /tmp/sedum-note-app-icon）");
}

const ARTWORK_PATH = "public/app-artwork.webp";
// アイコンに使う、絵の中の正方形（1024 × 1024 の絵の中の位置と一辺）。ブランコに寄せ、霧の空を減らす。
const ICON_CROP = { x: 72, y: 144, size: 880 };
const ICON_SIZE = 1024;
// 角丸の半径（1024 に対して）。前のアイコンと同じ。
const CORNER_RADIUS = 225;
// macOS の慣習: 1024 の中に 824 の角丸を置く。
const MACOS_TILE_SIZE = 824;
// Web の favicon と、画面の中のアイコン（AppIcon）。画面では 20〜40px で出すので、高い画素密度でも足りる大きさにする。
const WEB_ICON_SIZE = 256;
// Android のアダプティブアイコンは、108dp の層のうち中央の 72dp（2/3）が見える。
const ANDROID_VISIBLE_RATIO = 72 / 108;

const outputs = [
  { path: join(outputDirectory, "app-icon.png"), kind: "rounded", size: ICON_SIZE },
  { path: join(outputDirectory, "macos.png"), kind: "macos", size: ICON_SIZE },
  { path: join(outputDirectory, "android-background.png"), kind: "androidBackground", size: ICON_SIZE },
  // 絵は背景の層に全部入れるので、前景の層は透明にする。
  { path: join(outputDirectory, "android-foreground.png"), kind: "transparent", size: ICON_SIZE },
  { path: "public/app-icon.png", kind: "rounded", size: WEB_ICON_SIZE },
];
// tauri icon に渡す組み合わせ。android_fg_scale は、前景（透明）を縮めないための 100。
const TAURI_ICON_MANIFEST = { default: "app-icon.png", android_bg: "android-background.png", android_fg: "android-foreground.png", android_fg_scale: 100 };

function renderInPage({ artworkUrl, crop, cornerRadius, macosTileSize, androidVisibleRatio, outputs: requested }) {
  return new Promise((resolve) => {
    const artwork = new Image();
    artwork.onload = () => resolve(requested.map(({ kind, size }) => {
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const context = canvas.getContext("2d");
      context.imageSmoothingQuality = "high";
      const drawRoundedTile = (offset, tileSize) => {
        context.save();
        context.beginPath();
        context.roundRect(offset, offset, tileSize, tileSize, (cornerRadius / 1024) * tileSize);
        context.clip();
        context.drawImage(artwork, crop.x, crop.y, crop.size, crop.size, offset, offset, tileSize, tileSize);
        context.restore();
      };
      if (kind === "rounded") {
        drawRoundedTile(0, size);
      } else if (kind === "macos") {
        drawRoundedTile((size - (macosTileSize / 1024) * size) / 2, (macosTileSize / 1024) * size);
      } else if (kind === "androidBackground") {
        // 見える 2/3 に、切り抜いた正方形がちょうど入るように置く。外側（動かしたときだけ見える所）は、ぼかした絵で埋める。
        const scale = (size * androidVisibleRatio) / crop.size;
        const centerX = crop.x + crop.size / 2;
        const centerY = crop.y + crop.size / 2;
        context.filter = "blur(24px)";
        const coverScale = (size / artwork.width) * 1.2;
        context.drawImage(artwork, size / 2 - centerX * coverScale, size / 2 - centerY * coverScale, artwork.width * coverScale, artwork.height * coverScale);
        context.filter = "none";
        context.drawImage(artwork, size / 2 - centerX * scale, size / 2 - centerY * scale, artwork.width * scale, artwork.height * scale);
      }
      return canvas.toDataURL("image/png");
    }));
    artwork.src = artworkUrl;
  });
}

const browser = await chromium.launch();
const page = await browser.newPage();
const images = await page.evaluate(renderInPage, {
  artworkUrl: `data:image/webp;base64,${readFileSync(ARTWORK_PATH).toString("base64")}`,
  crop: ICON_CROP, cornerRadius: CORNER_RADIUS, macosTileSize: MACOS_TILE_SIZE, androidVisibleRatio: ANDROID_VISIBLE_RATIO,
  outputs: outputs.map(({ kind, size }) => ({ kind, size })),
});
await browser.close();
mkdirSync(outputDirectory, { recursive: true });
outputs.forEach(({ path }, index) => writeFileSync(path, Buffer.from(images[index].split(",")[1], "base64")));
writeFileSync(join(outputDirectory, "manifest.json"), JSON.stringify(TAURI_ICON_MANIFEST, null, 2));
console.log([...outputs.map(({ path }) => path), join(outputDirectory, "manifest.json")].join("\n"));
