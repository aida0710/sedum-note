// 失敗を、利用者に見せる文に直す。

import { InvalidBackupError } from "../../core/backup/backupFile";
import { MIN_PASSPHRASE_LENGTH } from "../../core/crypto/passphraseKey";
import { AppUpdateRequiredError } from "../../core/format/dataFormat";
import { ObjectStoreError } from "../../core/remote/objectStore";
import { VaultReplacedError } from "../../core/sync/syncEngine";
import { OutdatedSyncTargetError } from "../../core/vault/remoteVault";
import { InvalidSyncSetupError } from "../../core/vault/syncSetupFile";
import { SyncTargetChangedError, SyncTargetIncompleteError } from "../../core/vault/syncTarget";
import {
  InvalidVaultDocumentError, MIN_SYNC_KEY_LENGTH, WeakPassphraseError, WeakSyncKeyError, WrongPassphraseError, WrongSyncKeyError,
} from "../../core/vault/vaultDocument";
import { VaultAlreadyExistsError, VaultNotFoundError } from "../../core/vault/vaultSession";
import { isRunningInTauri } from "../platform/runtime";
import { translate } from "./translate";
import { UserFacingError } from "./userFacingError";

// ブラウザが、通信できなかった fetch に付けるメッセージ（Chromium・Firefox・WebKit の順）。
const NETWORK_FAILURE_MESSAGE = /^(Failed to fetch|NetworkError when attempting to fetch resource\.?|Load failed)$/;

// 失敗を、それだけで読む文にする（失敗の欄、知らせ）。
export function describeError(error: unknown): string {
  return knownErrorMessage(error) ?? translate("error.unknown", { detail: errorDetail(error) });
}

// 失敗を、ほかの文の理由（「最後の同期に失敗しました: {reason}」など）に入れる形にする。
// 中身の分からない失敗は、「処理に失敗しました」を重ねず、元のメッセージだけにする。
export function describeErrorReason(error: unknown): string {
  return knownErrorMessage(error) ?? errorDetail(error);
}

function errorDetail(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// 利用者に見せる文の決まっている失敗なら、その文。決まっていなければ null。
function knownErrorMessage(error: unknown): string | null {
  if (error instanceof WrongPassphraseError) {
    return translate("error.wrongPassphrase");
  }
  if (error instanceof WeakPassphraseError) {
    return translate("error.weakPassphrase", { minimum: MIN_PASSPHRASE_LENGTH });
  }
  if (error instanceof WrongSyncKeyError) {
    return translate("error.wrongSyncKey");
  }
  if (error instanceof WeakSyncKeyError) {
    return translate("error.weakSyncKey", { minimum: MIN_SYNC_KEY_LENGTH });
  }
  if (error instanceof SyncTargetChangedError) {
    return translate("error.syncTargetChanged");
  }
  if (error instanceof SyncTargetIncompleteError) {
    return translate("syncTarget.incomplete");
  }
  if (error instanceof InvalidSyncSetupError) {
    return translate("syncSetup.notSyncSetup");
  }
  if (error instanceof OutdatedSyncTargetError) {
    return translate("error.outdatedSyncTarget");
  }
  if (error instanceof InvalidVaultDocumentError) {
    return translate("error.invalidVault");
  }
  if (error instanceof VaultAlreadyExistsError) {
    return translate("error.vaultAlreadyExists");
  }
  if (error instanceof VaultNotFoundError) {
    return translate("error.vaultNotFound");
  }
  if (error instanceof AppUpdateRequiredError) {
    return translate("error.appUpdateRequired");
  }
  if (error instanceof InvalidBackupError) {
    return translate("error.invalidBackup");
  }
  if (error instanceof UserFacingError) {
    return error.message;
  }
  if (error instanceof VaultReplacedError) {
    return translate("error.vaultReplaced");
  }
  // ブラウザ（Web 版）では、CORS で断られたときも「届かない」に見えるので、CORS の設定を案内する。
  if (error instanceof ObjectStoreError && error.reason === "unreachable" && !isRunningInTauri()) {
    return translate("error.storage.unreachableFromBrowser");
  }
  if (error instanceof ObjectStoreError) {
    return translate(`error.storage.${error.reason}`, { detail: error.message });
  }
  if (error instanceof TypeError && NETWORK_FAILURE_MESSAGE.test(error.message)) {
    return translate("error.network");
  }
  // このデバイスの保存（IndexedDB）が、容量の上限に達した。
  if (error instanceof DOMException && error.name === "QuotaExceededError") {
    return translate("error.quotaExceeded");
  }
  return null;
}
