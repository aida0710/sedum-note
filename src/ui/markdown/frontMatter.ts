// Markdown のファイルの先頭に書く、メモの項目（タイトルなど）。「---」で挟んだ「名前: 値」の行にする。
// 値は JSON の文字列の形で書く（YAML としても読める）。読むときは、この形の行だけを拾う。

export type NoteFrontMatter = {
  title?: string;
  created?: string;
  updated?: string;
};

const FRONT_MATTER_NAMES = ["title", "created", "updated"] as const;
const FRONT_MATTER_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

export function withFrontMatter(frontMatter: NoteFrontMatter, markdown: string): string {
  const lines = FRONT_MATTER_NAMES
    .filter((name) => frontMatter[name] !== undefined)
    .map((name) => `${name}: ${JSON.stringify(frontMatter[name])}`);
  return `---\n${lines.join("\n")}\n---\n\n${markdown}`;
}

export function splitFrontMatter(text: string): { frontMatter: NoteFrontMatter; markdown: string } {
  const match = FRONT_MATTER_PATTERN.exec(text);
  if (!match) {
    return { frontMatter: {}, markdown: text };
  }
  const frontMatter: NoteFrontMatter = {};
  for (const line of (match[1] ?? "").split(/\r?\n/)) {
    const separator = line.indexOf(":");
    const name = FRONT_MATTER_NAMES.find((candidate) => candidate === line.slice(0, separator).trim());
    if (separator > 0 && name) {
      frontMatter[name] = unquoted(line.slice(separator + 1).trim());
    }
  }
  return { frontMatter, markdown: text.slice(match[0].length) };
}

function unquoted(value: string): string {
  if (value.startsWith('"')) {
    try {
      return String(JSON.parse(value));
    } catch {
      return value;
    }
  }
  return value.replace(/^'(.*)'$/, "$1");
}
