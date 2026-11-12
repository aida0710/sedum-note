// メモ全体の検索の言葉の読み方。空白で区切った言葉（題か本文にすべて含むメモ）のほかに、絞り込みの書き方がある。
//   #タグ、tag:タグ: そのタグのメモ
//   notebook:名前、ノートブック:名前: 名前にその文字を含むノートブックに入っているメモ
//   "空白を含む 言葉": 引用符で囲むと、空白ごと 1 つの言葉として探す（notebook:"旅行 計画" のようにも使える）

export type NoteSearchQuery = {
  // 小文字にした、題か本文に含むべき言葉。
  words: string[];
  // 小文字にした、タグの名前（# を除く）。
  tags: string[];
  // 小文字にした、ノートブックの名前に含むべき文字。
  notebookNames: string[];
};

const TAG_PREFIXES = ["#", "tag:"];
const NOTEBOOK_PREFIXES = ["notebook:", "ノートブック:"];

// 空白で区切る。引用符で囲んだ所は空白を含めて 1 つにする（引用符は外す）。
function tokensOf(text: string): string[] {
  return [...text.matchAll(/(?:[^\s"]+|"[^"]*")+/g)].map((match) => match[0].replaceAll('"', "")).filter((token) => token !== "");
}

function withoutPrefix(token: string, prefixes: string[]): string | null {
  const prefix = prefixes.find((candidate) => token.toLocaleLowerCase().startsWith(candidate));
  return prefix === undefined ? null : token.slice(prefix.length);
}

export function parseNoteSearchQuery(text: string): NoteSearchQuery {
  const query: NoteSearchQuery = { words: [], tags: [], notebookNames: [] };
  for (const token of tokensOf(text)) {
    const lowered = token.toLocaleLowerCase();
    const tag = withoutPrefix(lowered, TAG_PREFIXES);
    const notebookName = withoutPrefix(lowered, NOTEBOOK_PREFIXES);
    if (tag) {
      query.tags.push(tag);
    } else if (notebookName) {
      query.notebookNames.push(notebookName);
    } else {
      query.words.push(lowered);
    }
  }
  return query;
}

export type SearchableNote = {
  title: string;
  plainText: string;
  tags: string[];
  notebookIds: string[];
};

// notebookNameOf は、ノートブックの ID から名前を引く（無ければ undefined）。
export function matchesNoteSearch(note: SearchableNote, query: NoteSearchQuery, notebookNameOf: (notebookId: string) => string | undefined): boolean {
  const haystack = `${note.title}\n${note.plainText}`.toLocaleLowerCase();
  if (!query.words.every((word) => haystack.includes(word))) {
    return false;
  }
  const tags = note.tags.map((tag) => tag.toLocaleLowerCase());
  if (!query.tags.every((tag) => tags.includes(tag))) {
    return false;
  }
  const notebookNames = note.notebookIds.map((notebookId) => notebookNameOf(notebookId)?.toLocaleLowerCase() ?? "");
  return query.notebookNames.every((name) => notebookNames.some((notebookName) => notebookName.includes(name)));
}
