// vault の作成・参加・ロック解除と、ロック解除中に使う部品の組み立て。
//
// 同期先の設定（認証情報を含む）もマスターキーで暗号化して手元に置く。
// ロックしている間は、手元にも平文の認証情報が無い。

import { newRandomId } from "../crypto/randomId";
import { open, seal } from "../crypto/sealedBox";
import type { LocalStore } from "../local/localStore";
import { SerialQueue } from "../local/serialQueue";
import { NoteRepository } from "../notes/noteRepository";
import type { ObjectStore } from "../remote/objectStore";
import { PreconditionFailedError } from "../remote/objectStore";
import type { RemoteConfig } from "../remote/remoteConfig";
import type { ConflictCopyFactory } from "../sync/conflictResolution";
import { VAULT_OBJECT_KEY } from "../sync/remoteLayout";
import { SyncEngine } from "../sync/syncEngine";
import {
  changeVaultPassphrase,
  createVault,
  parseVaultDocument,
  serializeVaultDocument,
  unlockVault,
  type VaultDocument,
} from "./vaultDocument";

const REMOTE_CONFIG_BINDING = "settings:remote-config";
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export class VaultAlreadyExistsError extends Error {
  constructor() {
    super("the storage already has a vault; join it instead of creating one");
    this.name = "VaultAlreadyExistsError";
  }
}

export class VaultNotFoundError extends Error {
  constructor() {
    super("the storage has no vault yet");
    this.name = "VaultNotFoundError";
  }
}

export type VaultSessionEnvironment = {
  localStore: LocalStore;
  createObjectStore: (config: RemoteConfig) => ObjectStore;
  conflictCopyTitle: (originalTitle: string) => string;
};

export type UnlockedVault = {
  // 取り出せない形の CryptoKey。設定の暗号化と、同期先を付け替えるときに使う。
  masterKey: CryptoKey;
  repository: NoteRepository;
  // 同期先を設定していなければ null。
  syncEngine: SyncEngine | null;
  remoteConfig: RemoteConfig | null;
};

export type VaultState = "absent" | "locked";

export async function readVaultState(localStore: LocalStore): Promise<VaultState> {
  return (await localStore.readSetting<VaultDocument>("vault")) ? "locked" : "absent";
}

// 新しい vault を作る。同期先を指定したら、同期先にも vault.json を置く。
export async function createNewVault(
  environment: VaultSessionEnvironment,
  input: { passphrase: string; remoteConfig: RemoteConfig | null },
): Promise<UnlockedVault> {
  const { document, masterKey } = await createVault(input.passphrase);
  if (input.remoteConfig) {
    const objectStore = environment.createObjectStore(input.remoteConfig);
    try {
      await objectStore.put(VAULT_OBJECT_KEY, textEncoder.encode(serializeVaultDocument(document)), { ifAbsent: true });
    } catch (error) {
      throw error instanceof PreconditionFailedError ? new VaultAlreadyExistsError() : error;
    }
  }
  await saveVaultLocally(environment.localStore, { document, masterKey, remoteConfig: input.remoteConfig });
  return assembleUnlockedVault(environment, masterKey, input.remoteConfig);
}

// ほかのデバイスで作った vault に、このデバイスを加える。
export async function joinExistingVault(
  environment: VaultSessionEnvironment,
  input: { passphrase: string; remoteConfig: RemoteConfig },
): Promise<UnlockedVault> {
  const stored = await environment.createObjectStore(input.remoteConfig).get(VAULT_OBJECT_KEY);
  if (stored === null) {
    throw new VaultNotFoundError();
  }
  const document = parseVaultDocument(textDecoder.decode(stored.body));
  const masterKey = await unlockVault(document, input.passphrase);
  await saveVaultLocally(environment.localStore, { document, masterKey, remoteConfig: input.remoteConfig });
  return assembleUnlockedVault(environment, masterKey, input.remoteConfig);
}

export async function unlockLocalVault(environment: VaultSessionEnvironment, passphrase: string): Promise<UnlockedVault> {
  const document = await readLocalVaultDocument(environment.localStore);
  const masterKey = await unlockVault(document, passphrase);
  const sealedRemoteConfig = await environment.localStore.readSetting<Uint8Array>("sealedRemoteConfig");
  const remoteConfig = sealedRemoteConfig
    ? (JSON.parse(textDecoder.decode(await open(masterKey, sealedRemoteConfig, REMOTE_CONFIG_BINDING))) as RemoteConfig)
    : null;
  return assembleUnlockedVault(environment, masterKey, remoteConfig);
}

type SaveVaultInput = { document: VaultDocument; masterKey: CryptoKey; remoteConfig: RemoteConfig | null };

async function saveVaultLocally(localStore: LocalStore, input: SaveVaultInput): Promise<void> {
  await localStore.writeSetting("vault", input.document);
  if (!(await localStore.readSetting<string>("deviceId"))) {
    await localStore.writeSetting("deviceId", newRandomId());
  }
  const sealedRemoteConfig = input.remoteConfig
    ? await seal(input.masterKey, textEncoder.encode(JSON.stringify(input.remoteConfig)), REMOTE_CONFIG_BINDING)
    : undefined;
  await localStore.writeSetting("sealedRemoteConfig", sealedRemoteConfig);
}

async function assembleUnlockedVault(
  environment: VaultSessionEnvironment,
  masterKey: CryptoKey,
  remoteConfig: RemoteConfig | null,
): Promise<UnlockedVault> {
  const { localStore } = environment;
  const deviceId = (await localStore.readSetting<string>("deviceId")) ?? newRandomId();
  const writeQueue = new SerialQueue();
  const conflictCopies: ConflictCopyFactory = { newId: newRandomId, copyTitle: environment.conflictCopyTitle };
  const syncEngine = remoteConfig
    ? new SyncEngine({ localStore, objectStore: environment.createObjectStore(remoteConfig), masterKey, writeQueue, conflictCopies })
    : null;
  const repository = new NoteRepository({
    localStore,
    masterKey,
    deviceId,
    writeQueue,
    downloadBlob: (id) => syncEngine?.downloadBlob(id) ?? Promise.resolve(null),
  });
  await repository.load();
  return { masterKey, repository, syncEngine, remoteConfig };
}

// ロック解除中に同期先を設定する（または付け替える）。同期先に vault.json が無ければ
// 置き、あれば同じ vault かを確かめる。別の vault のバケットには混ぜない。
export async function connectRemote(
  environment: VaultSessionEnvironment,
  unlocked: UnlockedVault,
  remoteConfig: RemoteConfig,
): Promise<UnlockedVault> {
  const document = await readLocalVaultDocument(environment.localStore);
  const objectStore = environment.createObjectStore(remoteConfig);
  try {
    await objectStore.put(VAULT_OBJECT_KEY, textEncoder.encode(serializeVaultDocument(document)), { ifAbsent: true });
  } catch (error) {
    if (!(error instanceof PreconditionFailedError)) {
      throw error;
    }
    const existing = await objectStore.get(VAULT_OBJECT_KEY);
    if (existing === null || parseVaultDocument(textDecoder.decode(existing.body)).vaultId !== document.vaultId) {
      throw new VaultAlreadyExistsError();
    }
  }
  await saveVaultLocally(environment.localStore, { document, masterKey: unlocked.masterKey, remoteConfig });
  return assembleUnlockedVault(environment, unlocked.masterKey, remoteConfig);
}

// パスフレーズを変える。同期先の vault.json は、読んだときの ETag のときだけ書き換える。
export async function changePassphrase(
  environment: VaultSessionEnvironment,
  unlocked: UnlockedVault,
  passphrases: { current: string; next: string },
): Promise<void> {
  const document = await readLocalVaultDocument(environment.localStore);
  const changed = await changeVaultPassphrase(document, passphrases.current, passphrases.next);
  if (unlocked.remoteConfig) {
    const objectStore = environment.createObjectStore(unlocked.remoteConfig);
    const existing = await objectStore.get(VAULT_OBJECT_KEY);
    if (existing === null || parseVaultDocument(textDecoder.decode(existing.body)).vaultId !== document.vaultId) {
      throw new VaultNotFoundError();
    }
    await objectStore.put(VAULT_OBJECT_KEY, textEncoder.encode(serializeVaultDocument(changed)), { ifMatch: existing.etag });
  }
  await environment.localStore.writeSetting("vault", changed);
}

async function readLocalVaultDocument(localStore: LocalStore): Promise<VaultDocument> {
  const document = await localStore.readSetting<VaultDocument>("vault");
  if (!document) {
    throw new VaultNotFoundError();
  }
  return document;
}
