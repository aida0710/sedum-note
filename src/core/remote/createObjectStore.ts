// 同期先の設定に合う ObjectStore を作る。

import type { ObjectStore, StorageRequestSender } from "./objectStore";
import { isWebDavConfig, type RemoteConfig } from "./remoteConfig";
import { S3ObjectStore } from "./s3ObjectStore";
import { WebDavObjectStore } from "./webDavObjectStore";

export function createObjectStore(config: RemoteConfig, sendRequest: StorageRequestSender): ObjectStore {
  return isWebDavConfig(config) ? new WebDavObjectStore(config, sendRequest) : new S3ObjectStore(config, sendRequest);
}
