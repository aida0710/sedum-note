// vault.json: パスフレーズで包んだマスターキーと、包み方（Argon2id の値）を持つ文書。
//
// S3 の `<prefix>/vault.json` と手元の両方に同じものを置く。手元の写しがあれば、
// オフラインでもロックを解除できる。中のマスターキーは暗号文なので、この文書を
// 読めてもメモは読めない。

import { base64ToBytes, bytesToBase64 } from "../crypto/base64";
import {
  type Argon2idParameters,
  checkArgon2idParameters,
  derivePassphraseKey,
  MIN_PASSPHRASE_LENGTH,
  newArgon2idParameters,
} from "../crypto/passphraseKey";
import { isRandomId, newRandomId } from "../crypto/randomId";
import { importAesKey, open, seal, SealedBoxError } from "../crypto/sealedBox";

const VAULT_FORMAT = "memo-vault";
const VAULT_VERSION = 1;
const MASTER_KEY_LENGTH = 32;

export type VaultDocument = {
  format: typeof VAULT_FORMAT;
  version: typeof VAULT_VERSION;
  // 同期先ごとの vault を見分ける。包んだキーの binding にも入れる。
  vaultId: string;
  kdf: Argon2idParameters;
  wrappedMasterKey: string;
};

export class WrongPassphraseError extends Error {
  constructor() {
    super("the passphrase does not open this vault");
    this.name = "WrongPassphraseError";
  }
}

export class WeakPassphraseError extends Error {
  constructor() {
    super(`the passphrase must be at least ${MIN_PASSPHRASE_LENGTH} characters`);
    this.name = "WeakPassphraseError";
  }
}

export class InvalidVaultDocumentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidVaultDocumentError";
  }
}

function masterKeyBinding(vaultId: string): string {
  return `vault:${vaultId}:master-key`;
}

function checkPassphraseStrength(passphrase: string): void {
  if ([...passphrase].length < MIN_PASSPHRASE_LENGTH) {
    throw new WeakPassphraseError();
  }
}

export type CreatedVault = { document: VaultDocument; masterKey: CryptoKey };

export async function createVault(
  passphrase: string,
  kdfCost?: Omit<Argon2idParameters, "salt">,
): Promise<CreatedVault> {
  checkPassphraseStrength(passphrase);
  const rawMasterKey = crypto.getRandomValues(new Uint8Array(MASTER_KEY_LENGTH));
  try {
    const vaultId = newRandomId();
    const document = await wrapMasterKey({ rawMasterKey, passphrase, vaultId, kdfCost });
    return { document, masterKey: await importAesKey(rawMasterKey, false) };
  } finally {
    rawMasterKey.fill(0);
  }
}

export async function unlockVault(document: VaultDocument, passphrase: string): Promise<CryptoKey> {
  const rawMasterKey = await unwrapRawMasterKey(document, passphrase);
  try {
    return await importAesKey(rawMasterKey, false);
  } finally {
    rawMasterKey.fill(0);
  }
}

// パスフレーズを変える。マスターキーは同じなので、メモを暗号化し直す必要はない。
export async function changeVaultPassphrase(
  document: VaultDocument,
  currentPassphrase: string,
  newPassphrase: string,
): Promise<VaultDocument> {
  checkPassphraseStrength(newPassphrase);
  const rawMasterKey = await unwrapRawMasterKey(document, currentPassphrase);
  try {
    return await wrapMasterKey({ rawMasterKey, passphrase: newPassphrase, vaultId: document.vaultId, kdfCost: document.kdf });
  } finally {
    rawMasterKey.fill(0);
  }
}

type WrapMasterKeyInput = {
  rawMasterKey: Uint8Array;
  passphrase: string;
  vaultId: string;
  kdfCost: Omit<Argon2idParameters, "salt"> | undefined;
};

async function wrapMasterKey(input: WrapMasterKeyInput): Promise<VaultDocument> {
  const kdf = input.kdfCost
    ? newArgon2idParameters({
        iterations: input.kdfCost.iterations,
        memoryKiB: input.kdfCost.memoryKiB,
        parallelism: input.kdfCost.parallelism,
      })
    : newArgon2idParameters();
  const passphraseKey = await derivePassphraseKey(input.passphrase, kdf);
  const wrapped = await seal(passphraseKey, input.rawMasterKey, masterKeyBinding(input.vaultId));
  return {
    format: VAULT_FORMAT,
    version: VAULT_VERSION,
    vaultId: input.vaultId,
    kdf,
    wrappedMasterKey: bytesToBase64(wrapped),
  };
}

async function unwrapRawMasterKey(document: VaultDocument, passphrase: string): Promise<Uint8Array> {
  const passphraseKey = await derivePassphraseKey(passphrase, document.kdf);
  try {
    return await open(passphraseKey, base64ToBytes(document.wrappedMasterKey), masterKeyBinding(document.vaultId));
  } catch (error) {
    if (error instanceof SealedBoxError) {
      throw new WrongPassphraseError();
    }
    throw error;
  }
}

export function parseVaultDocument(text: string): VaultDocument {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new InvalidVaultDocumentError("vault.json is not JSON");
  }
  if (typeof value !== "object" || value === null) {
    throw new InvalidVaultDocumentError("vault.json is not an object");
  }
  const candidate = value as Partial<VaultDocument>;
  if (candidate.format !== VAULT_FORMAT || candidate.version !== VAULT_VERSION) {
    throw new InvalidVaultDocumentError("vault.json is not a vault of a supported version");
  }
  if (typeof candidate.vaultId !== "string" || !isRandomId(candidate.vaultId) ||
    typeof candidate.wrappedMasterKey !== "string" || typeof candidate.kdf !== "object" || candidate.kdf === null) {
    throw new InvalidVaultDocumentError("vault.json is missing a field");
  }
  const kdf = candidate.kdf;
  const parsed: VaultDocument = {
    format: VAULT_FORMAT,
    version: VAULT_VERSION,
    vaultId: candidate.vaultId,
    kdf: { iterations: kdf.iterations, memoryKiB: kdf.memoryKiB, parallelism: kdf.parallelism, salt: kdf.salt },
    wrappedMasterKey: candidate.wrappedMasterKey,
  };
  try {
    checkArgon2idParameters(parsed.kdf);
  } catch {
    throw new InvalidVaultDocumentError("vault.json asks for key derivation parameters outside the accepted range");
  }
  return parsed;
}

export function serializeVaultDocument(document: VaultDocument): string {
  return JSON.stringify(document);
}
