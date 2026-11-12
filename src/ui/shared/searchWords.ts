// 一覧を打った言葉で絞り込むときの当たりの決まり。空白で区切った言葉が全部（大文字と小文字を区別せずに）入っていれば当たり。
// コマンドパレット、メモやブロックを選ぶダイアログ、ノートブックを選ぶダイアログで、同じ決まりにする。

export function searchWordsOf(query: string): string[] {
  return query.toLocaleLowerCase().split(/\s+/).filter((word) => word !== "");
}

// words は searchWordsOf で分けたもの。言葉が 1 つも無ければ、何にでも当たる。
export function containsAllWords(text: string, words: string[]): boolean {
  const haystack = text.toLocaleLowerCase();
  return words.every((word) => haystack.includes(word));
}
