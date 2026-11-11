// 失敗を、利用者に見せる文に直す。

import { InvalidBackupError } from "../../core/backup/backupFile";
import { MIN_PASSPHRASE_LENGTH } from "../../core/crypto/passphraseKey";
import { AppUpdateRequiredError } from "../../core/notes/bodySchema";
import { ObjectStoreError } from "../../core/remote/objectStore";
import { VaultReplacedError } from "../../core/sync/syncEngine";
import { WeakPassphraseError, WrongPassphraseError } from "../../core/vault/vaultDocument";
import { VaultAlreadyExistsError, VaultNotFoundError } from "../../core/vault/vaultSession";
import { isRunningInTauri } from "../platform/runtime";
import { translate } from "./translate";
import { UserFacingError } from "./userFacingError";

export function describeError(error: unknown): string {
  if (error instanceof WrongPassphraseError) {
    return translate("error.wrongPassphrase");
  }
  if (error instanceof WeakPassphraseError) {
    return translate("error.weakPassphrase", { minimum: MIN_PASSPHRASE_LENGTH });
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
  return translate("error.unknown", { detail: error instanceof Error ? error.message : String(error) });
}
