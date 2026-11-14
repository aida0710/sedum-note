// 試験で、vault を作らずに NoteRepository だけを用意するための道具（鍵の導出を省いて速くする）。

import { newRandomId } from "../crypto/randomId";
import { importAesKey } from "../crypto/sealedBox";
import { IndexedDbLocalStore } from "../local/indexedDbLocalStore";
import type { LocalStore } from "../local/localStore";
import { SerialQueue } from "../local/serialQueue";
import { NoteRepository } from "./noteRepository";

const MASTER_KEY_BYTES = 32;

// fake-indexeddb を読み込んだ試験から呼ぶ。now を渡すと、時刻を試験から進められる。
// reopen は、同じ手元の保存と鍵で、新しい repository を開く（読み込み直したあとやロックを解除したあとに、何が残っているかを見るため）。
export async function newTestRepository(now?: () => Date): Promise<{ repository: NoteRepository; localStore: LocalStore; reopen: () => Promise<NoteRepository> }> {
  const localStore = new IndexedDbLocalStore(`test-${newRandomId()}`);
  const masterKey = await importAesKey(crypto.getRandomValues(new Uint8Array(MASTER_KEY_BYTES)), false);
  const deviceId = newRandomId();
  const open = async () => {
    const opened = new NoteRepository({
      localStore,
      masterKey,
      deviceId,
      writeQueue: new SerialQueue(),
      downloadBlob: async () => null,
      downloadVersions: async () => undefined,
      now,
    });
    await opened.load();
    return opened;
  };
  return { repository: await open(), localStore, reopen: open };
}
