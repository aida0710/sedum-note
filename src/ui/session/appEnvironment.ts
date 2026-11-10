// このアプリで使う保存先と同期先の組み立て。Web 版も Tauri の WebView も同じもの。

import { IndexedDbLocalStore } from "../../core/local/indexedDbLocalStore";
import { S3ObjectStore } from "../../core/remote/s3ObjectStore";
import type { VaultSessionEnvironment } from "../../core/vault/vaultSession";

const LOCAL_DATABASE_NAME = "sedum-note";

export function createAppEnvironment(): VaultSessionEnvironment {
  return {
    localStore: new IndexedDbLocalStore(LOCAL_DATABASE_NAME),
    createObjectStore: (config) => new S3ObjectStore(config),
  };
}
