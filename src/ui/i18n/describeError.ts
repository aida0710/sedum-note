// 失敗を、利用者に見せる文に直す。

import { MIN_PASSPHRASE_LENGTH } from "../../core/crypto/passphraseKey";
import { ObjectStoreError } from "../../core/remote/objectStore";
import { VaultReplacedError } from "../../core/sync/syncEngine";
import { WeakPassphraseError, WrongPassphraseError } from "../../core/vault/vaultDocument";
import { VaultAlreadyExistsError, VaultNotFoundError } from "../../core/vault/vaultSession";
import { translate } from "./translate";

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
  if (error instanceof VaultReplacedError) {
    return translate("error.vaultReplaced");
  }
  if (error instanceof ObjectStoreError) {
    return translate(`error.storage.${error.reason}`, { detail: error.message });
  }
  return translate("error.unknown", { detail: error instanceof Error ? error.message : String(error) });
}
