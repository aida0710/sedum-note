// vault の文書: 包んだマスターキーと、包み方（Argon2id の値）を持つ。
//
// マスターキー（メモを暗号化するランダムなキー）を、置き場所ごとに別の秘密で包む。
//   手元     このデバイスのパスフレーズで包む。同期先には置かない。ロックの解除に使う
//   同期先   全部のデバイスで共通の「暗号化キー」で包み、`<prefix>/vault.json` に置く。参加のときに使う
// そのため、パスフレーズはデバイスごとに決められ、変えても同期先は変わらない。暗号化キーを作り直しても、
// 包み直すだけで、メモを暗号化し直す必要はない。
//
// v0.2 までは、同期先にもパスフレーズで包んだ文書を置いていた。その同期先は使えない（remoteVault.ts が断る）。

import { base64ToBytes, bytesToBase64 } from "../crypto/base64";
import {
  type Argon2idParameters,
  checkArgon2idParameters,
  derivePassphraseKey,
  MIN_PASSPHRASE_LENGTH,
  newArgon2idParameters,
} from "../crypto/passphraseKey";
import { isRandomId, newRandomId } from "../crypto/randomId";
import { BODY_SCHEMA_VERSION } from "../notes/bodySchema";
import { importAesKey, open, seal, SealedBoxError } from "../crypto/sealedBox";

const VAULT_FORMAT = "sedum-note-vault";
// 2 から、記録の中身が Yjs の文書の状態になった。1 の同期先とは混ぜられない。
// 2 はパスフレーズで、3 は暗号化キーで包んだ文書。記録の形は 2 と 3 で同じ。
const VERSION_BY_WRAPPING = { passphrase: 2, syncKey: 3 } as const;
const MASTER_KEY_LENGTH = 32;
// 自分で決める暗号化キーの下限（sshc と同じ）。生成したものは 29 文字。
export const MIN_SYNC_KEY_LENGTH = 12;

// マスターキーを何で包んだか。
export type KeyWrapping = keyof typeof VERSION_BY_WRAPPING;

export type VaultDocument = {
  format: typeof VAULT_FORMAT;
  version: (typeof VERSION_BY_WRAPPING)[KeyWrapping];
  // 同期先ごとの vault を見分ける。包んだキーの binding にも入れる。
  vaultId: string;
  kdf: Argon2idParameters;
  wrappedMasterKey: string;
  // この vault のメモが使っている本文の形の版（notes/bodySchema.ts）。
  bodySchema: number;
};

export class WrongPassphraseError extends Error {
  constructor() {
    super("the passphrase does not open this vault");
    this.name = "WrongPassphraseError";
  }
}

export class WrongSyncKeyError extends Error {
  constructor() {
    super("the encryption key does not open this vault");
    this.name = "WrongSyncKeyError";
  }
}

export class WeakSyncKeyError extends Error {
  constructor() {
    super(`the encryption key must be at least ${MIN_SYNC_KEY_LENGTH} characters`);
    this.name = "WeakSyncKeyError";
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

export function keyWrappingOf(document: VaultDocument): KeyWrapping {
  return document.version === VERSION_BY_WRAPPING.syncKey ? "syncKey" : "passphrase";
}

// 包み方ごとに binding を分ける。暗号化キーで包んだものを、パスフレーズで包んだものとして差し替えられない。
function masterKeyBinding(vaultId: string, wrapping: KeyWrapping): string {
  return wrapping === "syncKey" ? `vault:${vaultId}:master-key:sync-key` : `vault:${vaultId}:master-key`;
}

function checkSecretStrength(secret: string, wrapping: KeyWrapping): void {
  const length = [...secret].length;
  if (wrapping === "passphrase" && length < MIN_PASSPHRASE_LENGTH) {
    throw new WeakPassphraseError();
  }
  if (wrapping === "syncKey" && length < MIN_SYNC_KEY_LENGTH) {
    throw new WeakSyncKeyError();
  }
}

function newRawMasterKey(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(MASTER_KEY_LENGTH));
}

// 取り出せない形のキーにする。メモの暗号化にはこれを使う。
function importMasterKey(rawMasterKey: Uint8Array): Promise<CryptoKey> {
  return importAesKey(rawMasterKey, false);
}

export type CreatedVault = { document: VaultDocument; masterKey: CryptoKey };

// 手元の vault を新しく作る（パスフレーズで包む）。
export async function createVault(
  passphrase: string,
  kdfCost?: Omit<Argon2idParameters, "salt">,
): Promise<CreatedVault> {
  const rawMasterKey = newRawMasterKey();
  try {
    const document = await wrapMasterKey({
      rawMasterKey, secret: passphrase, wrapping: "passphrase", vaultId: newRandomId(), kdfCost, bodySchema: BODY_SCHEMA_VERSION,
    });
    return { document, masterKey: await importMasterKey(rawMasterKey) };
  } finally {
    rawMasterKey.fill(0);
  }
}

export async function unlockVault(document: VaultDocument, secret: string): Promise<CryptoKey> {
  const rawMasterKey = await unwrapRawMasterKey(document, secret);
  try {
    return await importMasterKey(rawMasterKey);
  } finally {
    rawMasterKey.fill(0);
  }
}

// 同じマスターキーを、別の秘密（新しいパスフレーズ、暗号化キー）で包み直した文書を作る。
// マスターキーは同じなので、メモを暗号化し直す必要はない。
export async function rewrapVault(
  document: VaultDocument,
  currentSecret: string,
  next: { secret: string; wrapping: KeyWrapping },
): Promise<VaultDocument> {
  checkSecretStrength(next.secret, next.wrapping);
  const rawMasterKey = await unwrapRawMasterKey(document, currentSecret);
  try {
    return await wrapMasterKey({
      rawMasterKey, secret: next.secret, wrapping: next.wrapping, vaultId: document.vaultId, kdfCost: document.kdf, bodySchema: document.bodySchema,
    });
  } finally {
    rawMasterKey.fill(0);
  }
}

type WrapMasterKeyInput = {
  rawMasterKey: Uint8Array;
  secret: string;
  wrapping: KeyWrapping;
  vaultId: string;
  kdfCost: Omit<Argon2idParameters, "salt"> | undefined;
  bodySchema: number;
};

async function wrapMasterKey(input: WrapMasterKeyInput): Promise<VaultDocument> {
  checkSecretStrength(input.secret, input.wrapping);
  const kdf = input.kdfCost
    ? newArgon2idParameters({
        iterations: input.kdfCost.iterations,
        memoryKiB: input.kdfCost.memoryKiB,
        parallelism: input.kdfCost.parallelism,
      })
    : newArgon2idParameters();
  const wrappingKey = await derivePassphraseKey(input.secret, kdf);
  const wrapped = await seal(wrappingKey, input.rawMasterKey, masterKeyBinding(input.vaultId, input.wrapping));
  return {
    format: VAULT_FORMAT,
    version: VERSION_BY_WRAPPING[input.wrapping],
    vaultId: input.vaultId,
    kdf,
    wrappedMasterKey: bytesToBase64(wrapped),
    bodySchema: input.bodySchema,
  };
}

async function unwrapRawMasterKey(document: VaultDocument, secret: string): Promise<Uint8Array> {
  const wrapping = keyWrappingOf(document);
  const wrappingKey = await derivePassphraseKey(secret, document.kdf);
  try {
    return await open(wrappingKey, base64ToBytes(document.wrappedMasterKey), masterKeyBinding(document.vaultId, wrapping));
  } catch (error) {
    if (error instanceof SealedBoxError) {
      throw wrapping === "syncKey" ? new WrongSyncKeyError() : new WrongPassphraseError();
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
  if (candidate.format !== VAULT_FORMAT || (candidate.version !== VERSION_BY_WRAPPING.passphrase && candidate.version !== VERSION_BY_WRAPPING.syncKey)) {
    throw new InvalidVaultDocumentError("vault.json is not a vault of a supported version");
  }
  if (typeof candidate.vaultId !== "string" || !isRandomId(candidate.vaultId) ||
    typeof candidate.wrappedMasterKey !== "string" || typeof candidate.kdf !== "object" || candidate.kdf === null ||
    !Number.isInteger(candidate.bodySchema) || (candidate.bodySchema as number) < 1) {
    throw new InvalidVaultDocumentError("vault.json is missing a field");
  }
  const kdf = candidate.kdf;
  const parsed: VaultDocument = {
    format: VAULT_FORMAT,
    version: candidate.version,
    vaultId: candidate.vaultId,
    kdf: { iterations: kdf.iterations, memoryKiB: kdf.memoryKiB, parallelism: kdf.parallelism, salt: kdf.salt },
    wrappedMasterKey: candidate.wrappedMasterKey,
    bodySchema: candidate.bodySchema as number,
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
