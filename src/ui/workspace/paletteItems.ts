// コマンドパレットで探せるもの（メモ・ノートブック・タグ・設定の項目・操作）と、打った言葉での絞り込み。

import { excerptAt } from "../../core/notes/textExcerpt";
import { findFoldedWord, foldForSearch } from "../../core/notes/searchTextFolding";
import { containsAllWords, searchWordsOf } from "../shared/searchWords";

// create は、打った言葉を題にして新しいメモを作る項目（候補からではなく、パレットが最後に足す）。
export type PaletteItemKind = "note" | "notebook" | "tag" | "setting" | "command" | "create";

// 並べる順。種類ごとにまとめて、この順に出す。
export const PALETTE_KIND_ORDER: PaletteItemKind[] = ["note", "notebook", "tag", "setting", "command"];

export type PaletteItem = {
  id: string;
  kind: PaletteItemKind;
  label: string;
  // 名前の右に小さく出す補足（ショートカット、設定のページ、本文の抜き出し）。
  hint: string;
  run: () => void;
};

export type PaletteCandidate = PaletteItem & {
  // 名前のほかに、言葉が当たってよい文字（メモの本文、設定のページの名前）。
  extraText: string;
  // 新しいものを先に出すための時刻（メモ）。無ければ並べた順。
  updatedAt?: string;
  // 何も打っていないときにも、最近のメモの下に並べる、よく使う操作か。
  suggested?: boolean;
};

// 入力の先頭に置くと、操作だけを探す印。
export const COMMAND_PREFIX = ">";
// 種類ごとに一度に並べる件数。これより多いときは、打って絞ってもらう。
const MAX_ITEMS_PER_KIND: Record<PaletteItemKind, number> = { note: 20, notebook: 8, tag: 8, setting: 10, command: 20, create: 1 };
// 何も打っていないときに並べる、最近のメモの件数。その下に並べるよく使う操作まで、PC の画面（高さ 820px）で
// 送らずに見える数にしている。
const MAX_RECENT_NOTES = 8;

// 本文の中の、最初の言葉が当たった所の前後を 1 行にして出す。
function excerptAround(text: string, word: string): string {
  const match = findFoldedWord(text, word);
  return match === null ? "" : excerptAt(text, match);
}

// 候補ごとの、全角と半角・大文字と小文字をそろえた名前と、名前に本文などを足したもの。打つたびに全部のメモの本文をそろえ直すと、
// メモが多いとき（2,000 件）に打つたびに止まるので、候補ごとに 1 回だけ作って覚える（候補はパレットを開いている間は変わらない）。
const foldedTextsOfCandidate = new WeakMap<PaletteCandidate, { label: string; labelAndExtraText: string }>();

function foldedTextsOf(candidate: PaletteCandidate): { label: string; labelAndExtraText: string } {
  let folded = foldedTextsOfCandidate.get(candidate);
  if (!folded) {
    folded = { label: foldForSearch(candidate.label), labelAndExtraText: foldForSearch(`${candidate.label}\n${candidate.extraText}`) };
    foldedTextsOfCandidate.set(candidate, folded);
  }
  return folded;
}

// words は searchWordsOf で分けたもの（containsAllWords と同じ当たりの決まり）。
function includesAllWords(foldedText: string, words: string[]): boolean {
  return words.every((word) => foldedText.includes(word));
}

function byNewest(left: PaletteCandidate, right: PaletteCandidate): number {
  return (right.updatedAt ?? "").localeCompare(left.updatedAt ?? "");
}

export function searchPalette(candidates: PaletteCandidate[], query: string): PaletteItem[] {
  if (query.startsWith(COMMAND_PREFIX)) {
    const words = searchWordsOf(query.slice(COMMAND_PREFIX.length));
    return candidates.filter((candidate) => candidate.kind === "command" && containsAllWords(candidate.label, words));
  }
  const words = searchWordsOf(query);
  if (words.length === 0) {
    const recentNotes = candidates.filter((candidate) => candidate.kind === "note").sort(byNewest).slice(0, MAX_RECENT_NOTES);
    const suggestedCommands = candidates.filter((candidate) => candidate.kind === "command" && candidate.suggested);
    return [...recentNotes, ...suggestedCommands];
  }
  return PALETTE_KIND_ORDER.flatMap((kind) => {
    const ofKind = candidates.filter((candidate) => candidate.kind === kind);
    // 名前に当たったものを先に、本文などにだけ当たったものを後に並べる。
    const byLabel = ofKind.filter((candidate) => includesAllWords(foldedTextsOf(candidate).label, words)).sort(byNewest);
    const byExtraText = ofKind
      .filter((candidate) => !includesAllWords(foldedTextsOf(candidate).label, words) && includesAllWords(foldedTextsOf(candidate).labelAndExtraText, words))
      .sort(byNewest);
    const listed = [...byLabel, ...byExtraText].slice(0, MAX_ITEMS_PER_KIND[kind]);
    // 本文の抜き出しは重い（文字ごとに元の位置を覚えて探す）ので、並べる分にだけ作る（メモが 2,000 件あると、全部に作れば打つたびに 0.2 秒止まる）。
    const matchedByLabel = new Set(byLabel);
    return listed.map((candidate) => (candidate.kind === "note" && !matchedByLabel.has(candidate) ? { ...candidate, hint: excerptAround(candidate.extraText, words[0]!) } : candidate));
  });
}
