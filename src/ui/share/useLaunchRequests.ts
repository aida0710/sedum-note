// ロックを解除している間、アプリの外から頼まれたことを片付ける。共有で受け取った中身は新しいメモにして開き、
// ウィジェットやショートカットの「新しいメモ」は、空のメモを作って開く。ロック中に頼まれたものは、
// ネイティブ側のメモリに残っているので、解除してこの hook が動いたときに片付く。

import { useEffect, useRef } from "react";
import type { NoteRepository } from "../../core/notes/noteRepository";
import { subscribeToLaunchRequests, takeNewNoteRequest } from "../platform/launchRequests";
import { clearPendingSharedContent, pendingSharedContent } from "../platform/sharedContent";
import { createNoteFromSharedContent } from "./createNoteFromSharedContent";

export function useLaunchRequests(repository: NoteRepository, openNote: (noteId: string) => void): void {
  const openNoteRef = useRef(openNote);
  openNoteRef.current = openNote;
  useEffect(() => {
    // 同じ共有を 2 回メモにしないよう、取り込んでいる間は次を始めない。
    let receivingShare = false;
    const receiveShare = async () => {
      const shared = receivingShare ? null : pendingSharedContent();
      if (shared === null) {
        return;
      }
      receivingShare = true;
      try {
        openNoteRef.current(await createNoteFromSharedContent(repository, shared));
      } finally {
        // メモにできなかったときも忘れる。残すと、ロックを解除するたびに同じ失敗を繰り返す。
        clearPendingSharedContent();
        receivingShare = false;
      }
    };
    const handleRequests = async () => {
      if (takeNewNoteRequest()) {
        openNoteRef.current((await repository.createNote()).id);
      }
      await receiveShare();
    };
    void handleRequests();
    return subscribeToLaunchRequests(() => void handleRequests());
  }, [repository]);
}
