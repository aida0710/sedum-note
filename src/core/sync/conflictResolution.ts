// 2 台で同じ記録を変えたときに、どちらを残すかを決める。
//
// 方針は「どちらの編集も失わない」。メモの本文が両方で変わったら、同期先の方を
// そのまま残し、手元の方を「競合コピー」の別のメモとして足す。

import type { NoteRecord, SyncedRecord } from "../notes/noteRecords";

export type ConflictOutcome =
  // 同期先の記録を受け入れ、手元の変更は捨てる（手元の変更が削除だけのとき）。
  | { kind: "accept_remote" }
  // 手元の記録で同期先を上書きする。
  | { kind: "push_local" }
  // 同期先の記録を受け入れ、手元の内容を新しい記録として足す。
  | { kind: "accept_remote_and_add_copy"; copy: NoteRecord };

export type ConflictCopyFactory = {
  newId: () => string;
  // 競合コピーのタイトル。画面の言語で決めるので、呼び出し側から渡す。
  copyTitle: (originalTitle: string) => string;
};

export function resolveConflict(local: SyncedRecord, remote: SyncedRecord, factory: ConflictCopyFactory): ConflictOutcome {
  if (local.removed) {
    // 手元では削除、同期先では編集（または削除）。編集を残す。
    return { kind: "accept_remote" };
  }
  if (remote.removed) {
    // ほかのデバイスで完全に削除されたが、手元では編集していた。編集を残す。
    return { kind: "push_local" };
  }
  if (JSON.stringify(local.content) === JSON.stringify(remote.content)) {
    return { kind: "accept_remote" };
  }
  if (local.kind === "notebook" || remote.kind === "notebook") {
    // ノートブックは名前と親だけなので、新しい方を残す。
    return local.updatedAt > remote.updatedAt ? { kind: "push_local" } : { kind: "accept_remote" };
  }
  if (onlyFlagsDiffer(local, remote)) {
    return local.updatedAt > remote.updatedAt ? { kind: "push_local" } : { kind: "accept_remote" };
  }
  const copy: NoteRecord = {
    ...local,
    id: factory.newId(),
    content: { ...local.content, title: factory.copyTitle(local.content.title) },
  };
  return { kind: "accept_remote_and_add_copy", copy };
}

// ピン留め・お気に入り・ゴミ箱・ノートブックの付け替えだけの違いなら、競合コピーを
// 作るほどではない。本文とタイトルと添付が同じかで見る。
function onlyFlagsDiffer(local: NoteRecord & { removed: false }, remote: NoteRecord & { removed: false }): boolean {
  return local.content.title === remote.content.title &&
    JSON.stringify(local.content.document) === JSON.stringify(remote.content.document) &&
    JSON.stringify(local.content.attachments) === JSON.stringify(remote.content.attachments);
}
