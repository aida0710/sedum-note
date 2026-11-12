// 同期の失敗を、待てば直るもの（回線が切れた、同期先が一時的に応えない）と、利用者が直すまで
// 直らないものに分ける。直らないものを自動で繰り返すと、同じ失敗で同期先を叩き続けるだけになる。

import { AppUpdateRequiredError } from "../format/dataFormat";
import { ObjectStoreError, type ObjectStoreFailureReason } from "../remote/objectStore";
import { OutdatedSyncTargetError } from "../vault/remoteVault";
import { InvalidVaultDocumentError } from "../vault/vaultDocument";
import { VaultReplacedError } from "./syncEngine";

// 同期先の設定か、バケットの側を直さないと通らない失敗。
const PERMANENT_STORAGE_FAILURES: ReadonlySet<ObjectStoreFailureReason> = new Set([
  "forbidden", "bucket_not_found", "etag_hidden", "conditional_writes_unsupported",
]);

export function isPermanentSyncFailure(error: unknown): boolean {
  if (error instanceof ObjectStoreError) {
    return PERMANENT_STORAGE_FAILURES.has(error.reason);
  }
  // 同期先が別の vault になった、vault.json がこのアプリの読めない形（v0.2 までの形を含む）、アプリの方が古い。
  return error instanceof VaultReplacedError || error instanceof InvalidVaultDocumentError ||
    error instanceof OutdatedSyncTargetError || error instanceof AppUpdateRequiredError;
}
