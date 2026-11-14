// 仮のタブで開いているメモに書いたら（本文・題・期限・プロパティを変えたら）、普通のタブにする。
// 書いたかどうかは、メモの更新日時が進んだかで見る。更新日時は中身を変えたときだけ進み、開いただけで付くブロックの ID や
// 折りたたみ、ピン留め・お気に入り・ノートブックの付け替えでは進まない（core/notes/noteRepository.ts の isNoteContentField）。
// 前提: 同期やほかのウィンドウで届いた編集でも更新日時は進むので、そのときも普通のタブになる。

import { useEffect } from "react";
import type { NoteRepository } from "../../core/notes/noteRepository";

type KeepPreviewTabOnEditInput = {
  repository: NoteRepository;
  previewTab: string | null;
  keepPreviewTab: (tabId: string) => void;
};

export function useKeepPreviewTabOnEdit({ repository, previewTab, keepPreviewTab }: KeepPreviewTabOnEditInput): void {
  useEffect(() => {
    if (previewTab === null) {
      return undefined;
    }
    const updatedAtWhenOpened = repository.note(previewTab)?.updatedAt;
    return repository.subscribe(() => {
      const updatedAt = repository.note(previewTab)?.updatedAt;
      if (updatedAt !== undefined && updatedAt !== updatedAtWhenOpened) {
        keepPreviewTab(previewTab);
      }
    });
  }, [repository, previewTab, keepPreviewTab]);
}
