// データの形の版（dataFormat.ts）を上げたときに、手元の記録を新しい形にする手順。
//
// 手順は、手元の vault の版が低いときに、ロックを解除して記録を読み込んだあと、版の古い順に流す。全部が済んでから
// 手元の vault の版を上げるので、途中で止まったら次の解除でもう一度流れる。そのため、どの手順も、何度流しても
// 同じ結果になるように書く。同期先の vault.json の版は、同期の始めに引き上げる（sync/syncEngine.ts）。
// 版を上げる前に古いアプリが送った記録は、あとから届くことがある。読む側は、古い形の記録も読めるようにしておく。

import type * as Y from "yjs";

export type DataFormatMigration = {
  // この版へ上げるときに流す。
  version: number;
  // 記録 1 件の文書を書き換える。変える所が無ければ、何も書かない（何も書かなければ、記録は保存し直さない）。
  migrateRecord: (doc: Y.Doc) => void;
};

// @tiptap/y-tiptap 3.0.x が文書に書いた、カーソルの位置を移す記録の名前の頭。3.1.0 以降の y-tiptap は、エディタで
// 開いたメモの記録だけを消す（clearPositionMigrations。外からは呼べない）。開いていないメモの記録も消すため、
// 同じ決まりでここでも消す。
const LEGACY_POSITION_MIGRATIONS_PREFIX = "__tiptap_position_migrations:";

function clearLegacyPositionMigrations(doc: Y.Doc): void {
  const stores: Y.Map<unknown>[] = [];
  for (const name of doc.share.keys()) {
    if (name.startsWith(LEGACY_POSITION_MIGRATIONS_PREFIX)) {
      const store = doc.getMap(name);
      if (store.size > 0) {
        stores.push(store);
      }
    }
  }
  if (stores.length === 0) {
    return;
  }
  doc.transact(() => {
    for (const store of stores) {
      store.clear();
    }
  });
}

export const DATA_FORMAT_MIGRATIONS: readonly DataFormatMigration[] = [
  { version: 14, migrateRecord: clearLegacyPositionMigrations },
];

// storedVersion より大きく、targetVersion までの手順を、版の古い順に返す。
export function migrationsBetween(storedVersion: number, targetVersion: number): DataFormatMigration[] {
  return DATA_FORMAT_MIGRATIONS
    .filter((migration) => migration.version > storedVersion && migration.version <= targetVersion)
    .sort((left, right) => left.version - right.version);
}
