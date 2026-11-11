// エディタの中から、ほかのメモの今の名前と状態を引き、ほかのメモを開くための入口。メモ同士の
// リンク（ID だけを持つので、リンク先のタイトルを変えても表示がついてくる）と、履歴から
// 復元したメモを開くのに使う。

import { createContext } from "react";
import type { NoteRepository } from "../../core/notes/noteRepository";

export type NoteLinkTarget =
  | { state: "live" | "trashed"; title: string }
  // 完全に削除したメモか、まだこのデバイスに届いていないメモ。
  | { state: "missing" };

export type NoteLinkTargets = {
  describeTarget: (noteId: string) => NoteLinkTarget;
  openNote: (noteId: string) => void;
};

export function createNoteLinkTargets(repository: NoteRepository, openNote: (noteId: string) => void): NoteLinkTargets {
  return {
    openNote,
    describeTarget: (noteId) => {
      const target = repository.note(noteId);
      if (!target) {
        return { state: "missing" };
      }
      return { state: target.content.trashedAt === null ? "live" : "trashed", title: target.content.title };
    },
  };
}

export const NoteLinkTargetsContext = createContext<NoteLinkTargets>({
  describeTarget: () => ({ state: "missing" }),
  openNote: () => undefined,
});
