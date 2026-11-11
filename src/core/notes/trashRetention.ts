// ゴミ箱に入れてから決めた日数がたったメモを、完全に削除する。
//
// 完全な削除は、同期でほかのデバイスにも伝わり、元に戻せない。呼ぶのは、同期が成功した直後
// （同期なしなら、ロックを解除したとき）だけにする。古い状態のまま消すと、ほかのデバイスで
// ゴミ箱から戻したメモを消してしまう。

import type { NoteRepository } from "./noteRepository";

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

// 消した件数を返す。
export async function removeExpiredTrash(repository: NoteRepository, retentionDays: number, now: Date): Promise<number> {
  const expiresBefore = now.getTime() - retentionDays * MILLISECONDS_PER_DAY;
  const expired = repository.notes().filter((note) =>
    note.content.trashedAt !== null && new Date(note.content.trashedAt).getTime() <= expiresBefore);
  for (const note of expired) {
    await repository.removeNotePermanently(note.id);
  }
  return expired.length;
}
