// Markdown のファイルの先頭に書く、メモの項目（タイトルなど）とプロパティ。「---」で挟んだ「名前: 値」の行にする。
// 値は JSON の形で書く（YAML としても読める）。読むときは、この形の行だけを拾う。

export type NoteFrontMatter = {
  title?: string;
  created?: string;
  updated?: string;
  // メモのプロパティ。名前から値。読んだときの値は、書いてあった文字のまま（種類に合わせるのは呼び出し側）。
  properties?: Record<string, string | number | boolean>;
};

const FRONT_MATTER_NAMES = ["title", "created", "updated"] as const;
const FRONT_MATTER_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

export function withFrontMatter(frontMatter: NoteFrontMatter, markdown: string): string {
  const lines = FRONT_MATTER_NAMES
    .filter((name) => frontMatter[name] !== undefined)
    .map((name) => `${name}: ${JSON.stringify(frontMatter[name])}`);
  // 決まった項目と同じ名前や、行を壊す名前（「:」や改行を含む）のプロパティは書かない。
  const propertyLines = Object.entries(frontMatter.properties ?? {})
    .filter(([name]) => !isReservedName(name) && !/[:\r\n]/.test(name) && name.trim() !== "")
    .map(([name, value]) => `${name}: ${JSON.stringify(value)}`);
  return `---\n${[...lines, ...propertyLines].join("\n")}\n---\n\n${markdown}`;
}

export function splitFrontMatter(text: string): { frontMatter: NoteFrontMatter; markdown: string } {
  const match = FRONT_MATTER_PATTERN.exec(text);
  if (!match) {
    return { frontMatter: {}, markdown: text };
  }
  const frontMatter: NoteFrontMatter = {};
  for (const line of (match[1] ?? "").split(/\r?\n/)) {
    const separator = line.indexOf(":");
    const writtenName = line.slice(0, separator).trim();
    const name = FRONT_MATTER_NAMES.find((candidate) => candidate === writtenName);
    if (separator > 0 && name) {
      frontMatter[name] = unquoted(line.slice(separator + 1).trim());
    } else if (separator > 0 && writtenName !== "") {
      frontMatter.properties = { ...frontMatter.properties, [writtenName]: unquoted(line.slice(separator + 1).trim()) };
    }
  }
  return { frontMatter, markdown: text.slice(match[0].length) };
}

function isReservedName(name: string): boolean {
  return (FRONT_MATTER_NAMES as readonly string[]).includes(name);
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
