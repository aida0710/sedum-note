// データの形の版。メモの記録（Yjs の文書）と本文の形を、どの版のアプリが読み書きしてよいかを決める。
// 決まりの全体は docs/data-format.md。
//
// vault.json（手元と同期先）の項目 bodySchema に、その vault のデータの形の版を持つ。項目の名前は、v0.5.0 までの
// 「本文の形の版」のまま変えない。v0.5.0 までのアプリはこの名前の数を読み、自分より大きければ開かず・同期しないので、
// 名前を変えると、古いアプリが新しい形のデータを書き換えてしまう。
//
// 版を上げるとき:
//   - エディタが扱うノードや書式（src/ui/editor/editorExtensions.ts）を足したとき。古いアプリのエディタは、知らない
//     ノードを本文から消し、その削除が同期でほかのデバイスへ広がる。
//   - 記録の Yjs の文書の中身の決まりを変えたとき、または古いアプリに書かせたくない書き方をやめたとき。
// 版を上げたら、要るなら dataFormatMigrations.ts に、手元の記録を新しい形にする手順を足す。
//
// 1: 最初の形。
// 2: 見出しを 6 段までにした。
// 3: ハイライト、文字色、表のセルの背景色を足した。
// 4: 箇条書きの項目と見出しに、折りたたみの属性を足した。
// 5: コールアウトを足した。
// 6: クエリのブロックを足した。
// 7: 数式（行の中と、独立した行）を足した。
// 8: 段組みを足した。
// 9: 脚注を足した。
// 10: 動画・Web ページの埋め込みを足した。
// 11: ブロックの ID（段落、見出し、箇条書きの項目の属性）と、メモへのリンクのブロックの指定を足した。
// 12: ブロックの埋め込みを足した。
// 13: 手書き・図形のブロックを足した（v0.5.0）。
// 14: エディタと Yjs をつなぐ部品（@tiptap/y-tiptap）を 3.0.10 から 3.3.0 にした。3.0.x は、構造を変える編集と
//     元に戻す操作のたびに、カーソルの位置を移す記録を文書に書き足し、文書が膨らむ。新しい版はこの記録を書かない。
//     古いアプリが書き続けないよう、版を上げて止める。手元に残った記録は、移し替えの手順で消す。
// 15: 写真のブロックに幅（width）の属性を足した。古いアプリのエディタは知らない属性を落とし、写真を動かしたときなどに
//     幅の記録を消してしまうので、版を上げて止める。手元の記録を書き換える手順は要らない。
export const DATA_FORMAT_VERSION = 15;

export class AppUpdateRequiredError extends Error {
  constructor() {
    super("the notes were written by a newer version of the app");
    this.name = "AppUpdateRequiredError";
  }
}

// 保存されているデータの形の版が、このアプリで扱えるかを確かめる。新しすぎれば AppUpdateRequiredError。
export function ensureDataFormatSupported(storedVersion: number, supportedVersion: number): void {
  if (storedVersion > supportedVersion) {
    throw new AppUpdateRequiredError();
  }
}
