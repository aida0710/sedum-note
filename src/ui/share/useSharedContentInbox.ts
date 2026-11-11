// ロックを解除している間、共有で受け取った中身を新しいメモにして開く。ロック中に受け取ったものは、
// ネイティブ側のメモリに残っているので、解除してこの hook が動いたときにメモになる。

import { useEffect, useRef } from "react";
import type { NoteRepository } from "../../core/notes/noteRepository";
import { clearPendingSharedContent, pendingSharedContent, subscribeToSharedContent } from "../platform/sharedContent";
import { createNoteFromSharedContent } from "./createNoteFromSharedContent";

export function useSharedContentInbox(repository: NoteRepository, openNote: (noteId: string) => void): void {
  const openNoteRef = useRef(openNote);
  openNoteRef.current = openNote;
  useEffect(() => {
    // 同じ共有を 2 回メモにしないよう、取り込んでいる間は次を始めない。
    let receiving = false;
    const receive = async () => {
      const shared = receiving ? null : pendingSharedContent();
      if (shared === null) {
        return;
      }
      receiving = true;
      try {
        openNoteRef.current(await createNoteFromSharedContent(repository, shared));
      } finally {
        // メモにできなかったときも忘れる。残すと、ロックを解除するたびに同じ失敗を繰り返す。
        clearPendingSharedContent();
        receiving = false;
      }
    };
    void receive();
    return subscribeToSharedContent(() => void receive());
  }, [repository]);
}
