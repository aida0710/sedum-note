// 書き出すファイルとフォルダの名前。どの OS でも作れる名前にし、同じフォルダの中で重ならないようにする。

// Windows でファイル名に使えない文字と、制御文字。
const UNSAFE_FILE_NAME_CHARACTERS = /[\\/:*?"<>|\u0000-\u001f]/g;
// 名前の長さの上限（文字数）。拡張子と重複を避ける番号を足しても、OS の上限（255 バイト）に収まる長さ。
const MAX_FILE_NAME_LENGTH = 80;

export function safeFileName(name: string, fallbackName: string): string {
  const cleaned = [...name.replace(UNSAFE_FILE_NAME_CHARACTERS, "_").trim().replace(/^\.+/, "").replace(/[. ]+$/, "")]
    .slice(0, MAX_FILE_NAME_LENGTH).join("");
  return cleaned === "" ? fallbackName : cleaned;
}

// 同じフォルダに同じ名前があれば「名前 (2)」のように番号を足す。大文字と小文字は同じ名前として扱う。
export class UniquePaths {
  readonly #taken = new Set<string>();

  claim(directory: string, baseName: string, extension: string): string {
    for (let attempt = 1; ; attempt += 1) {
      const fileName = `${attempt === 1 ? baseName : `${baseName} (${attempt})`}${extension}`;
      const path = directory === "" ? fileName : `${directory}/${fileName}`;
      if (!this.#taken.has(path.toLowerCase())) {
        this.#taken.add(path.toLowerCase());
        return path;
      }
    }
  }
}

// Markdown のリンクに書く形（空白や括弧を % で表す）と、その戻し。
export function encodeMarkdownPath(path: string): string {
  return path.split("/").map((segment) => encodeURIComponent(segment).replace(/[()]/g, (bracket) => `%${bracket.charCodeAt(0).toString(16)}`)).join("/");
}

export function decodeMarkdownPath(href: string): string {
  try {
    return decodeURIComponent(href);
  } catch {
    return href;
  }
}

// from のファイルから見た to の相対パス。どちらも書き出しの根からのパス。
export function relativePath(fromFilePath: string, toPath: string): string {
  const depth = fromFilePath.split("/").length - 1;
  return `${"../".repeat(depth)}${toPath}`;
}

// リンク先の相対パスを、リンクを書いたファイルの場所から解決する。根より上へ出るものは null。
export function resolveRelativePath(fromFilePath: string, relative: string): string | null {
  const segments = fromFilePath.split("/").slice(0, -1);
  for (const segment of relative.split("/")) {
    if (segment === "" || segment === ".") {
      continue;
    }
    if (segment === "..") {
      if (segments.length === 0) {
        return null;
      }
      segments.pop();
    } else {
      segments.push(segment);
    }
  }
  return segments.join("/");
}
