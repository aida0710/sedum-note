// アプリに入れている、ほかの人が作ったソフトウェア（npm のパッケージと Rust のクレート）の名前・版・ライセンスと、
// パッケージに入っているライセンスの文（LICENSE・COPYING・NOTICE など）を集め、public/third-party-licenses.json に書く。
// 設定の「このアプリについて」の「ライセンス」で出す。MIT や BSD などは、配るときにライセンスの文を一緒に付けることが条件なので、
// 依存を足したり版を上げたりしたら、流し直す（src/ui/about/thirdPartyLicenses.test.ts が、流し忘れを見つける）。
// 使い方: リポジトリの直下で npm run licenses（npm install と、Rust のクレートの取得が済んでいること）

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const OUTPUT_PATH = "public/third-party-licenses.json";
// このアプリ自身（一覧に入れない）。
const OWN_PACKAGE_NAMES = new Set(["sedum-note"]);
// ライセンスの文が入っているファイルの名前（LICENSE-MIT、LICENCE.txt、COPYING、NOTICE、UNLICENSE など）。
const LICENSE_FILE_PATTERN = /^(un)?(licen[cs]e|copying|notice|copyright)([-._].*)?$/i;

// パッケージにライセンスの文が入っていないときに載せる、ライセンスの標準の文（scripts/licenses/standard-texts/）。
// 「A OR B」のライセンスでは、この順で最初に当たったものを選ぶ。
const STANDARD_TEXT_LICENSES = ["MIT", "Apache-2.0", "Zlib", "BSD-3-Clause", "MPL-2.0"];
const STANDARD_TEXT_DIRECTORY = "scripts/licenses/standard-texts";

function addText(text, texts) {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  const id = createHash("sha256").update(normalized).digest("hex").slice(0, 16);
  texts[id] = normalized;
  return id;
}

// ライセンスの式（「MIT OR Apache-2.0」「MIT/Apache-2.0」など）から、標準の文を載せられるものを 1 つ選ぶ。
function standardLicenseOf(expression) {
  const names = (expression ?? "").split(/\s+OR\s+|\s+AND\s+|\/|[()]/).map((name) => name.trim()).filter(Boolean);
  return STANDARD_TEXT_LICENSES.find((license) => names.includes(license)) ?? null;
}

// 文の入っていないパッケージに、標準の文を当てる。standardText は、当てたライセンスの名前（画面で「標準の文」と断る）。
function withStandardTextIfMissing(entry, texts) {
  if (entry.textIds.length > 0) {
    return { ...entry, standardText: null };
  }
  const license = standardLicenseOf(entry.license);
  if (license === null) {
    return { ...entry, standardText: null };
  }
  const id = addText(readFileSync(join(STANDARD_TEXT_DIRECTORY, `${license}.txt`), "utf8"), texts);
  return { ...entry, textIds: [id], standardText: license };
}

// 1 つのパッケージのフォルダから、ライセンスの文のファイルを読む。同じ文は texts に 1 回だけ入れ、ID で指す。
function readLicenseTexts(directory, texts) {
  if (!existsSync(directory)) {
    return [];
  }
  return readdirSync(directory)
    .filter((fileName) => LICENSE_FILE_PATTERN.test(fileName) && statSync(join(directory, fileName)).isFile())
    .sort()
    .map((fileName) => addText(readFileSync(join(directory, fileName), "utf8"), texts));
}

function repositoryUrlOf(repository) {
  const url = typeof repository === "string" ? repository : repository?.url;
  if (!url) {
    return null;
  }
  return url.replace(/^git\+/, "").replace(/^git:\/\//, "https://").replace(/\.git$/, "").replace(/^github:/, "https://github.com/");
}

function collectNpmPackages(texts) {
  // .prod は、devDependencies から辿れないもの（アプリに入るもの）。
  const packages = JSON.parse(execFileSync("npm", ["query", ".prod"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }));
  return packages
    .filter((entry) => !OWN_PACKAGE_NAMES.has(entry.name))
    .map((entry) => ({
      ecosystem: "npm",
      name: entry.name,
      version: entry.version,
      license: typeof entry.license === "string" ? entry.license : entry.license?.type ?? null,
      repository: repositoryUrlOf(entry.repository) ?? `https://www.npmjs.com/package/${entry.name}`,
      textIds: readLicenseTexts(entry.path, texts),
    }));
}

function collectRustCrates(texts) {
  const metadata = JSON.parse(execFileSync("cargo", ["metadata", "--format-version", "1", "--locked"], { cwd: "src-tauri", encoding: "utf8", maxBuffer: 256 * 1024 * 1024 }));
  return metadata.packages
    .filter((crate) => !OWN_PACKAGE_NAMES.has(crate.name))
    .map((crate) => ({
      ecosystem: "cargo",
      name: crate.name,
      version: crate.version,
      license: crate.license ?? (crate.license_file ? "SEE LICENSE FILE" : null),
      repository: crate.repository ?? `https://crates.io/crates/${crate.name}`,
      textIds: readLicenseTexts(join(crate.manifest_path, ".."), texts),
    }));
}

const texts = {};
const packages = [...collectNpmPackages(texts), ...collectRustCrates(texts)]
  .map((entry) => withStandardTextIfMissing(entry, texts))
  .sort((left, right) => left.ecosystem.localeCompare(right.ecosystem) || left.name.localeCompare(right.name) || left.version.localeCompare(right.version));
// 使っている文だけを、決まった順に残す（流し直したときの差分を小さくする）。
const usedTexts = Object.fromEntries(Object.entries(texts).sort(([left], [right]) => left.localeCompare(right)));
writeFileSync(OUTPUT_PATH, `${JSON.stringify({ packages, texts: usedTexts })}\n`);
const withStandardText = packages.filter((entry) => entry.standardText !== null).length;
const withoutText = packages.filter((entry) => entry.textIds.length === 0).map((entry) => `${entry.name}@${entry.version}（${entry.license}）`);
console.log(`${OUTPUT_PATH}: ${packages.length} 件、ライセンスの文 ${Object.keys(usedTexts).length} 種類。標準の文を当てたもの ${withStandardText} 件`);
if (withoutText.length > 0) {
  console.log(`文を当てられなかったもの: ${withoutText.join("、")}`);
}
