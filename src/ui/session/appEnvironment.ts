// このアプリで使う保存先と同期先の組み立て。保存先は Web 版もアプリも同じで、同期先への送り方だけが違う。

import { IndexedDbLocalStore } from "../../core/local/indexedDbLocalStore";
import { createObjectStore } from "../../core/remote/createObjectStore";
import { createCrossWindowWriteQueue, createRecordChangeChannel } from "../platform/crossWindowStorage";
import { storageRequestSender } from "../platform/storageRequestSender";
import type { VaultSessionEnvironment } from "../../core/vault/vaultSession";

const LOCAL_DATABASE_NAME = "sedum-note";

export function createAppEnvironment(): VaultSessionEnvironment {
  const sendStorageRequest = storageRequestSender();
  return {
    localStore: new IndexedDbLocalStore(LOCAL_DATABASE_NAME),
    createObjectStore: (config) => createObjectStore(config, sendStorageRequest),
    createWriteQueue: createCrossWindowWriteQueue,
    createRecordChangeChannel,
  };
}
