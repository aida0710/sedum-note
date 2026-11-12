// 試験で、vault を作らずに NoteRepository だけを用意するための道具（鍵の導出を省いて速くする）。

import { newRandomId } from "../crypto/randomId";
import { importAesKey } from "../crypto/sealedBox";
import { IndexedDbLocalStore } from "../local/indexedDbLocalStore";
import type { LocalStore } from "../local/localStore";
import { SerialQueue } from "../local/serialQueue";
import { NoteRepository } from "./noteRepository";

const MASTER_KEY_BYTES = 32;

// fake-indexeddb を読み込んだ試験から呼ぶ。now を渡すと、時刻を試験から進められる。
export async function newTestRepository(now?: () => Date): Promise<{ repository: NoteRepository; localStore: LocalStore }> {
  const localStore = new IndexedDbLocalStore(`test-${newRandomId()}`);
  const repository = new NoteRepository({
    localStore,
    masterKey: await importAesKey(crypto.getRandomValues(new Uint8Array(MASTER_KEY_BYTES)), false),
    deviceId: newRandomId(),
    writeQueue: new SerialQueue(),
    downloadBlob: async () => null,
    downloadVersions: async () => undefined,
    now,
  });
  await repository.load();
  return { repository, localStore };
}
