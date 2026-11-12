// エディタの中から、ほかのメモの今の名前と状態を引き、ほかのメモを開くための入口。メモ同士の
// リンク（ID だけを持つので、リンク先のタイトルを変えても表示がついてくる）と、履歴から
// 復元したメモを開くのに使う。

import { createContext } from "react";
import { blockLineText, findBlock } from "../../core/notes/bodyBlocks";
import type { NoteRepository } from "../../core/notes/noteRepository";

// リンクが指すブロック。none はメモ全体へのリンク、missing は指したブロックが消えている。
export type LinkedBlock = { state: "none" | "missing" } | { state: "found"; text: string };

export type NoteLinkTarget =
  | { state: "live" | "trashed"; title: string; block: LinkedBlock }
  // 完全に削除したメモか、まだこのデバイスに届いていないメモ。
  | { state: "missing" };

// リンクから来て、開いたメモの中で見せるブロック。
export type BlockToReveal = { noteId: string; blockId: string };

export type NoteLinkTargets = {
  describeTarget: (noteId: string, blockId: string | null) => NoteLinkTarget;
  // blockId を渡すと、メモを開いたあと、そのブロックまで送る。
  openNote: (noteId: string, blockId?: string) => void;
  blockToReveal: BlockToReveal | null;
};

type NoteLinkNavigation = Pick<NoteLinkTargets, "openNote" | "blockToReveal">;

export function createNoteLinkTargets(repository: NoteRepository, navigation: NoteLinkNavigation): NoteLinkTargets {
  return {
    openNote: navigation.openNote,
    blockToReveal: navigation.blockToReveal,
    describeTarget: (noteId, blockId) => {
      const target = repository.note(noteId);
      if (!target) {
        return { state: "missing" };
      }
      const linkedBlock = blockId === null ? null : findBlock(target.body, blockId);
      const block: LinkedBlock = blockId === null ? { state: "none" } : linkedBlock ? { state: "found", text: blockLineText(linkedBlock) } : { state: "missing" };
      return { state: target.content.trashedAt === null ? "live" : "trashed", title: target.content.title, block };
    },
  };
}

export const NoteLinkTargetsContext = createContext<NoteLinkTargets>({
  describeTarget: () => ({ state: "missing" }),
  openNote: () => undefined,
  blockToReveal: null,
});
