// 本文の中の、探している言葉に色を付ける。メモの中の検索（Ctrl+F）と、検索の結果から開いたメモで使う。
// 色は表示のための飾り（decoration）で、本文そのものは変えない（同期もされない）。

import { Extension } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { DEFAULT_SEARCH_OPTIONS, findSearchMatches, type SearchMatch, type SearchOptions } from "./searchMatches";
import { type EditorState, Plugin, PluginKey, type Transaction } from "@tiptap/pm/state";
import { yUndoPluginKey } from "@tiptap/y-tiptap";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

export type SearchHighlightState = {
  // 探す言葉か正規表現と、探し方の切り替え（searchMatches.ts）。
  query: string;
  options: SearchOptions;
  // 正規表現として読めなかったとき true。
  invalidPattern: boolean;
  matches: SearchMatch[];
  // いま選んでいる当たり（matches の中の位置）。当たりが無ければ -1。
  activeIndex: number;
  decorations: DecorationSet;
};

type SearchHighlightMeta = { query: string; options: SearchOptions } | { activeIndex: number };

export const searchHighlightKey = new PluginKey<SearchHighlightState>("searchHighlight");

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    searchHighlight: {
      // options を省くと、言葉で、大文字と小文字を区別せずに探す（左の列の検索の言葉に色を付けるとき）。
      setSearchQuery: (query: string, options?: SearchOptions) => ReturnType;
      // direction が 1 なら次、-1 なら前の当たりへ移る（端まで行ったら反対の端へ）。
      moveToSearchMatch: (direction: 1 | -1) => ReturnType;
      // いま選んでいる当たりを、replacement に置き換える。
      replaceActiveSearchMatch: (replacement: string) => ReturnType;
      // 当たりを全部、replacement に置き換える。1 回の取り消しで全部戻る。
      replaceAllSearchMatches: (replacement: string) => ReturnType;
    };
  }
}

// 空の文字に置き換えるときは、当たりを消す（insertText は空の文字を入れられない）。正規表現の $1 などは、当たりごとに展開する。
function replaceMatch(transaction: Transaction, match: SearchMatch, replacement: string): Transaction {
  const text = match.replacementFor(replacement);
  return text === "" ? transaction.delete(match.from, match.to) : transaction.insertText(text, match.from, match.to);
}

// 置換を、直前の入力とは別の取り消しの単位にする（続けて行った変更は、既定では 1 回の取り消しにまとまる）。
function startNewUndoStep(state: EditorState): void {
  (yUndoPluginKey.getState(state) as { undoManager?: { stopCapturing: () => void } } | undefined)?.undoManager?.stopCapturing();
}

type BuildStateInput = { doc: ProseMirrorNode; query: string; options: SearchOptions; activeIndex: number };

function buildState({ doc, query, options, activeIndex }: BuildStateInput): SearchHighlightState {
  const { matches, invalidPattern } = findSearchMatches(doc, query, options);
  const active = matches.length === 0 ? -1 : Math.min(Math.max(activeIndex, 0), matches.length - 1);
  const decorations = DecorationSet.create(doc, matches.map((match, index) =>
    Decoration.inline(match.from, match.to, { class: index === active ? "search-match active" : "search-match" })));
  return { query, options, invalidPattern, matches, activeIndex: active, decorations };
}

export const SearchHighlight = Extension.create({
  name: "searchHighlight",
  addCommands() {
    return {
      setSearchQuery: (query, options = DEFAULT_SEARCH_OPTIONS) => ({ tr, dispatch }) => {
        dispatch?.(tr.setMeta(searchHighlightKey, { query, options } satisfies SearchHighlightMeta));
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
      replaceActiveSearchMatch: (replacement) => ({ state, tr, dispatch }) => {
        const current = searchHighlightKey.getState(state);
        const match = current?.matches[current.activeIndex];
        if (!match) {
          return false;
        }
        if (dispatch) {
          startNewUndoStep(state);
          dispatch(replaceMatch(tr, match, replacement));
        }
        return true;
      },
      replaceAllSearchMatches: (replacement) => ({ state, tr, dispatch }) => {
        const matches = searchHighlightKey.getState(state)?.matches ?? [];
        if (matches.length === 0) {
          return false;
        }
        // 後ろから置き換える（前から置き換えると、後ろの当たりの位置がずれる）。
        if (dispatch) {
          startNewUndoStep(state);
          dispatch([...matches].reverse().reduce((transaction, match) => replaceMatch(transaction, match, replacement), tr));
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
          init: (_config, state) => buildState({ doc: state.doc, query: "", options: DEFAULT_SEARCH_OPTIONS, activeIndex: 0 }),
          apply(transaction, previous) {
            const meta = transaction.getMeta(searchHighlightKey) as SearchHighlightMeta | undefined;
            const { doc } = transaction;
            if (meta && "query" in meta) {
              return buildState({ doc, query: meta.query, options: meta.options, activeIndex: 0 });
            }
            if (meta) {
              return buildState({ doc, query: previous.query, options: previous.options, activeIndex: meta.activeIndex });
            }
            return transaction.docChanged ? buildState({ doc, query: previous.query, options: previous.options, activeIndex: previous.activeIndex }) : previous;
          },
        },
        props: {
          decorations: (state) => searchHighlightKey.getState(state)?.decorations,
        },
      }),
    ];
  },
});
