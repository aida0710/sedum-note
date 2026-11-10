// このアプリで使う保存先と同期先の組み立て。Web 版も Tauri の WebView も同じもの。

import { IndexedDbLocalStore } from "../../core/local/indexedDbLocalStore";
import { S3ObjectStore } from "../../core/remote/s3ObjectStore";
import type { VaultSessionEnvironment } from "../../core/vault/vaultSession";
import { translate } from "../i18n/translate";

const LOCAL_DATABASE_NAME = "memo-app";

export function createAppEnvironment(): VaultSessionEnvironment {
  return {
    localStore: new IndexedDbLocalStore(LOCAL_DATABASE_NAME),
    createObjectStore: (config) => new S3ObjectStore(config),
    conflictCopyTitle: (title) => `${title || translate("sidebar.untitled")}（競合コピー）`,
  };
}
