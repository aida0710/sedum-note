// アプリの更新のプラグインが読む latest.json を書く。CI のリリースの job と、更新の予行で使う。
//
// 使い方:
//   node scripts/release/writeUpdateManifest.mjs --version 0.2.0 --base-url <ファイルを置く URL> \
//     --directory <ファイルと .sig のあるフォルダ> --output latest.json <プラットフォーム>=<ファイル名>...
//
// プラットフォームは「OS-アーキテクチャ-入れ方」（linux-x86_64-appimage、windows-x86_64-nsis など）。
// アプリは、自分の入れ方に合うものを先に探し、無ければ「OS-アーキテクチャ」を使う。
// 署名は、ビルドが各ファイルの隣に置いた <ファイル名>.sig から読む。

import { readFile, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";

const { values: options, positionals: platformFiles } = parseArgs({
  allowPositionals: true,
  options: {
    version: { type: "string" },
    "base-url": { type: "string" },
    directory: { type: "string" },
    output: { type: "string" },
  },
});
for (const name of ["version", "base-url", "directory", "output"]) {
  if (!options[name]) {
    throw new Error(`--${name} is required`);
  }
}
if (platformFiles.length === 0) {
  throw new Error("give at least one <platform>=<file name>");
}

const platforms = {};
for (const platformFile of platformFiles) {
  const separator = platformFile.indexOf("=");
  const platform = platformFile.slice(0, separator);
  const fileName = platformFile.slice(separator + 1);
  if (separator <= 0 || fileName === "") {
    throw new Error(`expected <platform>=<file name>, got ${platformFile}`);
  }
  platforms[platform] = {
    signature: (await readFile(`${options.directory}/${fileName}.sig`, "utf8")).trim(),
    url: `${options["base-url"].replace(/\/$/, "")}/${encodeURIComponent(fileName)}`,
  };
}

const manifest = { version: options.version, pub_date: new Date().toISOString(), platforms };
await writeFile(options.output, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`wrote ${options.output} for ${Object.keys(platforms).join(", ")}`);
