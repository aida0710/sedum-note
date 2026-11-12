// このアプリで使う保存先と同期先の組み立て。保存先は Web 版もアプリも同じで、同期先への送り方だけが違う。

import { IndexedDbLocalStore } from "../../core/local/indexedDbLocalStore";
import { createObjectStore } from "../../core/remote/createObjectStore";
import { createCrossWindowWriteQueue, createRecordChangeChannel, sendWindowSignal } from "../platform/crossWindowStorage";
import { storageRequestSender } from "../platform/storageRequestSender";
import type { VaultSessionEnvironment } from "../../core/vault/vaultSession";
import { databaseNameOfSpace } from "./spaceRegistry";

// スペース（spaceRegistry.ts）ごとに、手元の保存を分ける。
export function createAppEnvironment(spaceId: string): VaultSessionEnvironment {
  const sendStorageRequest = storageRequestSender();
  return {
    localStore: new IndexedDbLocalStore(databaseNameOfSpace(spaceId)),
    createObjectStore: (config) => createObjectStore(config, sendStorageRequest),
    createWriteQueue: createCrossWindowWriteQueue,
    createRecordChangeChannel,
    announceDataFormat: (version) => sendWindowSignal({ kind: "dataFormatAdopted", version }),
  };
}
