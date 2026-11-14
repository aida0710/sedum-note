// メモ全体の検索の言葉の読み方。空白で区切った言葉（題か本文にすべて含むメモ）のほかに、絞り込みの書き方がある。
//   #タグ、tag:タグ: そのタグのメモ
//   notebook:名前、ノートブック:名前: 名前にその文字を含むノートブックに入っているメモ
//   "空白を含む 言葉": 引用符で囲むと、空白ごと 1 つの言葉として探す（notebook:"旅行 計画" のようにも使える）
// 全角と半角、大文字と小文字は区別しない（searchTextFolding.ts）。

import { foldForSearch } from "./searchTextFolding";

export type NoteSearchQuery = {
  // 文字をそろえた（foldForSearch）、題か本文に含むべき言葉。
  words: string[];
  // 文字をそろえた、タグの名前（# を除く）。
  tags: string[];
  // 文字をそろえた、ノートブックの名前に含むべき文字。
  notebookNames: string[];
};

// 打った言葉と同じくそろえておく（全角の「＃」「：」や、カタカナの「ノートブック:」もそのまま読めるように）。
const TAG_PREFIXES = ["#", "tag:"].map((prefix) => foldForSearch(prefix));
const NOTEBOOK_PREFIXES = ["notebook:", "ノートブック:"].map((prefix) => foldForSearch(prefix));

// 空白で区切る。引用符で囲んだ所は空白を含めて 1 つにする（引用符は外す）。
function tokensOf(text: string): string[] {
  return [...text.matchAll(/(?:[^\s"]+|"[^"]*")+/g)].map((match) => match[0].replaceAll('"', "")).filter((token) => token !== "");
}

function withoutPrefix(token: string, prefixes: string[]): string | null {
  const prefix = prefixes.find((candidate) => token.startsWith(candidate));
  return prefix === undefined ? null : token.slice(prefix.length);
}

export function parseNoteSearchQuery(text: string): NoteSearchQuery {
  const query: NoteSearchQuery = { words: [], tags: [], notebookNames: [] };
  for (const token of tokensOf(text)) {
    // 先にそろえるので、全角の「＃」「：」で書いた絞り込みも読める。
    const folded = foldForSearch(token);
    const tag = withoutPrefix(folded, TAG_PREFIXES);
    const notebookName = withoutPrefix(folded, NOTEBOOK_PREFIXES);
    if (tag) {
      query.tags.push(tag);
    } else if (notebookName) {
      query.notebookNames.push(notebookName);
    } else {
      query.words.push(folded);
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
  const haystack = foldForSearch(`${note.title}\n${note.plainText}`);
  if (!query.words.every((word) => haystack.includes(word))) {
    return false;
  }
  const tags = note.tags.map(foldForSearch);
  if (!query.tags.every((tag) => tags.includes(tag))) {
    return false;
  }
  const notebookNames = note.notebookIds.map((notebookId) => foldForSearch(notebookNameOf(notebookId) ?? ""));
  return query.notebookNames.every((name) => notebookNames.some((notebookName) => notebookName.includes(name)));
}
