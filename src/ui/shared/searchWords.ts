// 一覧を打った言葉で絞り込むときの当たりの決まり。空白で区切った言葉が全部入っていれば当たり
// （全角と半角、大文字と小文字は区別しない）。
// コマンドパレット、メモやブロックを選ぶダイアログ、ノートブックを選ぶダイアログで、同じ決まりにする。

import { foldForSearch } from "../../core/notes/searchTextFolding";

export function searchWordsOf(query: string): string[] {
  return foldForSearch(query).split(/\s+/).filter((word) => word !== "");
}

// words は searchWordsOf で分けたもの。言葉が 1 つも無ければ、何にでも当たる。
export function containsAllWords(text: string, words: string[]): boolean {
  const haystack = foldForSearch(text);
  return words.every((word) => haystack.includes(word));
}
