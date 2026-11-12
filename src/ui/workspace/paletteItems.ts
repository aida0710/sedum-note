// コマンドパレットで探せるもの（メモ・ノートブック・タグ・設定の項目・操作）と、打った言葉での絞り込み。

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
};

// 入力の先頭に置くと、操作だけを探す印。
export const COMMAND_PREFIX = ">";
// 種類ごとに一度に並べる件数。これより多いときは、打って絞ってもらう。
const MAX_ITEMS_PER_KIND: Record<PaletteItemKind, number> = { note: 20, notebook: 8, tag: 8, setting: 10, command: 20, create: 1 };
// 何も打っていないときに並べる、最近のメモの件数。
const MAX_RECENT_NOTES = 30;
// 本文だけに当たったメモに添える、本文の抜き出しの長さ（当たった言葉の前と後ろ）。
const EXCERPT_BEFORE = 8;
const EXCERPT_AFTER = 24;

function wordsOf(query: string): string[] {
  return query.toLocaleLowerCase().split(/\s+/).filter((word) => word !== "");
}

function containsAll(text: string, words: string[]): boolean {
  const haystack = text.toLocaleLowerCase();
  return words.every((word) => haystack.includes(word));
}

// 本文の中の、最初の言葉が当たった所の前後を 1 行にして出す。
function excerptAround(text: string, word: string): string {
  const index = text.toLocaleLowerCase().indexOf(word);
  if (index === -1) {
    return "";
  }
  const start = Math.max(0, index - EXCERPT_BEFORE);
  const excerpt = text.slice(start, index + word.length + EXCERPT_AFTER).replace(/\s+/g, " ").trim();
  return `${start > 0 ? "…" : ""}${excerpt}…`;
}

function byNewest(left: PaletteCandidate, right: PaletteCandidate): number {
  return (right.updatedAt ?? "").localeCompare(left.updatedAt ?? "");
}

export function searchPalette(candidates: PaletteCandidate[], query: string): PaletteItem[] {
  if (query.startsWith(COMMAND_PREFIX)) {
    const words = wordsOf(query.slice(COMMAND_PREFIX.length));
    return candidates.filter((candidate) => candidate.kind === "command" && containsAll(candidate.label, words));
  }
  const words = wordsOf(query);
  if (words.length === 0) {
    return candidates.filter((candidate) => candidate.kind === "note").sort(byNewest).slice(0, MAX_RECENT_NOTES);
  }
  return PALETTE_KIND_ORDER.flatMap((kind) => {
    const ofKind = candidates.filter((candidate) => candidate.kind === kind);
    // 名前に当たったものを先に、本文などにだけ当たったものを後に並べる。
    const byLabel = ofKind.filter((candidate) => containsAll(candidate.label, words)).sort(byNewest);
    const byExtraText = ofKind
      .filter((candidate) => !containsAll(candidate.label, words) && containsAll(`${candidate.label}\n${candidate.extraText}`, words))
      .sort(byNewest)
      .map((candidate) => (candidate.kind === "note" ? { ...candidate, hint: excerptAround(candidate.extraText, words[0]!) } : candidate));
    return [...byLabel, ...byExtraText].slice(0, MAX_ITEMS_PER_KIND[kind]);
  });
}
