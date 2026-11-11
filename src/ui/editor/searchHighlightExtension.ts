// 本文の中の、探している言葉に色を付ける。メモの中の検索（Ctrl+F）と、検索の結果から開いたメモで使う。
// 色は表示のための飾り（decoration）で、本文そのものは変えない（同期もされない）。

import { Extension } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

export type SearchMatch = { from: number; to: number };
export type SearchHighlightState = {
  // 空白で区切った言葉。どれかに当たった所に色を付ける。
  query: string;
  matches: SearchMatch[];
  // いま選んでいる当たり（matches の中の位置）。当たりが無ければ -1。
  activeIndex: number;
  decorations: DecorationSet;
};

type SearchHighlightMeta = { query: string } | { activeIndex: number };

export const searchHighlightKey = new PluginKey<SearchHighlightState>("searchHighlight");
// 文字でないもの（メモへのリンクなど）の代わりに置く文字。言葉がそこをまたいで当たらないようにする。
const INLINE_ATOM_PLACEHOLDER = "￼";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    searchHighlight: {
      setSearchQuery: (query: string) => ReturnType;
      // direction が 1 なら次、-1 なら前の当たりへ移る（端まで行ったら反対の端へ）。
      moveToSearchMatch: (direction: 1 | -1) => ReturnType;
    };
  }
}

// 段落ごとに文字をつなげて探す（太字などの書式の境目をまたぐ言葉も当たるように）。
export function findSearchMatches(doc: ProseMirrorNode, query: string): SearchMatch[] {
  const words = query.toLocaleLowerCase().split(/\s+/).filter((word) => word !== "");
  if (words.length === 0) {
    return [];
  }
  const matches: SearchMatch[] = [];
  doc.descendants((node, position) => {
    if (!node.isTextblock) {
      return true;
    }
    let text = "";
    node.forEach((child) => {
      text += child.isText ? child.text ?? "" : INLINE_ATOM_PLACEHOLDER.repeat(child.nodeSize);
    });
    const haystack = text.toLocaleLowerCase();
    // 小文字にすると長さが変わる文字があると位置がずれるので、そのときはこの段落を飛ばす。
    if (haystack.length !== text.length) {
      return false;
    }
    for (const word of words) {
      for (let index = haystack.indexOf(word); index !== -1; index = haystack.indexOf(word, index + word.length)) {
        matches.push({ from: position + 1 + index, to: position + 1 + index + word.length });
      }
    }
    return false;
  });
  return matches.sort((left, right) => left.from - right.from);
}

function buildState(doc: ProseMirrorNode, query: string, activeIndex: number): SearchHighlightState {
  const matches = findSearchMatches(doc, query);
  const active = matches.length === 0 ? -1 : Math.min(Math.max(activeIndex, 0), matches.length - 1);
  const decorations = DecorationSet.create(doc, matches.map((match, index) =>
    Decoration.inline(match.from, match.to, { class: index === active ? "search-match active" : "search-match" })));
  return { query, matches, activeIndex: active, decorations };
}

export const SearchHighlight = Extension.create({
  name: "searchHighlight",
  addCommands() {
    return {
      setSearchQuery: (query) => ({ tr, dispatch }) => {
        dispatch?.(tr.setMeta(searchHighlightKey, { query } satisfies SearchHighlightMeta));
        return true;
      },
      moveToSearchMatch: (direction) => ({ state, tr, dispatch, view }) => {
        const current = searchHighlightKey.getState(state);
        if (!current || current.matches.length === 0) {
          return false;
        }
        const activeIndex = (current.activeIndex + direction + current.matches.length) % current.matches.length;
        dispatch?.(tr.setMeta(searchHighlightKey, { activeIndex } satisfies SearchHighlightMeta));
        const match = current.matches[activeIndex];
        if (match) {
          // 描き直しのあとで、選んだ当たりを見える所へ送る。
          requestAnimationFrame(() => (view.domAtPos(match.from).node as Element | Text).parentElement?.scrollIntoView({ block: "center" }));
        }
        return true;
      },
    };
  },
  addProseMirrorPlugins() {
    return [
      new Plugin<SearchHighlightState>({
        key: searchHighlightKey,
        state: {
          init: (_config, state) => buildState(state.doc, "", 0),
          apply(transaction, previous) {
            const meta = transaction.getMeta(searchHighlightKey) as SearchHighlightMeta | undefined;
            if (meta && "query" in meta) {
              return buildState(transaction.doc, meta.query, 0);
            }
            if (meta) {
              return buildState(transaction.doc, previous.query, meta.activeIndex);
            }
            return transaction.docChanged ? buildState(transaction.doc, previous.query, previous.activeIndex) : previous;
          },
        },
        props: {
          decorations: (state) => searchHighlightKey.getState(state)?.decorations,
        },
      }),
    ];
  },
});
