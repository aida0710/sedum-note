// 左の列の検索から開いたメモで、探した言葉に色を付ける。開いたときは、最初の当たりまで送る。

import type { Editor } from "@tiptap/react";
import { useEffect, useRef } from "react";

// メモごとの、開いたときに当たりまで送った言葉。同じ言葉のままタブを戻したときは、送らずに前の位置（rememberedNoteView.ts）へ戻す。
const revealedSearchWordByNote = new Map<string, string>();

// このメモを開いたときに、searchWord の最初の当たりまで送るか。
export function opensAtSearchMatch(noteId: string, searchWord: string): boolean {
  return searchWord !== "" && revealedSearchWordByNote.get(noteId) !== searchWord;
}

type SearchWordHighlightInput = {
  editor: Editor | null;
  noteId: string;
  searchWord: string;
  // メモの中の検索を開いている間は、そちらの言葉に色を付けるので、何もしない。
  paused: boolean;
};

export function useSearchWordHighlight({ editor, noteId, searchWord, paused }: SearchWordHighlightInput): void {
  const openedEditor = useRef<Editor | null>(null);
  useEffect(() => {
    if (!editor || paused) {
      return;
    }
    const justOpened = openedEditor.current !== editor;
    openedEditor.current = editor;
    if (justOpened && opensAtSearchMatch(noteId, searchWord)) {
      revealedSearchWordByNote.set(noteId, searchWord);
      editor.commands.setSearchQueryAndReveal(searchWord);
    } else {
      editor.commands.setSearchQuery(searchWord);
    }
  }, [editor, noteId, paused, searchWord]);
}
