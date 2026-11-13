// ゴミ箱に入れてから決めた日数がたったメモを、完全に削除する。
//
// 完全な削除は、同期でほかのデバイスにも伝わり、元に戻せない。呼ぶのは、同期が成功した直後
// （同期なしなら、ロックを解除したとき）だけにする。古い状態のまま消すと、ほかのデバイスで
// ゴミ箱から戻したメモを消してしまう。

import type { NoteRepository } from "./noteRepository";
import type { LiveNote } from "./noteRecords";

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

// ゴミ箱に入れてから retentionDays 日がたったメモ。設定を変える前に、いま消える件数を見せるのにも使う。
export function expiredTrashNotes(notes: LiveNote[], retentionDays: number, now: Date): LiveNote[] {
  const expiresBefore = now.getTime() - retentionDays * MILLISECONDS_PER_DAY;
  return notes.filter((note) => note.content.trashedAt !== null && new Date(note.content.trashedAt).getTime() <= expiresBefore);
}

// 消した件数を返す。
export async function removeExpiredTrash(repository: NoteRepository, retentionDays: number, now: Date): Promise<number> {
  const expired = expiredTrashNotes(repository.notes(), retentionDays, now);
  // 1 件ごとに画面へ知らせると、件数の 2 乗の時間がかかる。消し終えてから 1 回知らせる。
  await repository.holdChangeNotifications(async () => {
    for (const note of expired) {
      await repository.removeNotePermanently(note.id);
    }
  });
  return expired.length;
}
