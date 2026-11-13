// vault の作成・参加・ロック解除と、ロック解除中に使う部品の組み立て。
//
// 手元の vault はこのデバイスのパスフレーズで、同期先の vault.json は全部のデバイスで共通の暗号化キーで
// 包む（vaultDocument.ts）。同期先の設定（認証情報を含む）もマスターキーで暗号化して手元に置く。
// ロックしている間は、手元にも平文の認証情報が無い。

import { newGeneratedPassphrase } from "../crypto/generatedPassphrase";
import type { Argon2idParameters } from "../crypto/passphraseKey";
import { newRandomId } from "../crypto/randomId";
import { open, seal } from "../crypto/sealedBox";
import type { LocalStore } from "../local/localStore";
import { SerialQueue, type WriteQueue } from "../local/serialQueue";
import type { RecordChangeChannel } from "../notes/recordChangeChannel";
import { DATA_FORMAT_VERSION, ensureDataFormatSupported } from "../format/dataFormat";
import { migrationsBetween } from "../format/dataFormatMigrations";
import { NoteRepository } from "../notes/noteRepository";
import { ensureConditionalWrites } from "../remote/conditionalWriteCheck";
import type { ObjectStore } from "../remote/objectStore";
import { ObjectStoreError, PreconditionFailedError } from "../remote/objectStore";
import type { RemoteConfig } from "../remote/remoteConfig";
import { BLOBS_PREFIX, VAULT_OBJECT_KEY } from "../sync/remoteLayout";
import { SyncEngine } from "../sync/syncEngine";
import { readRemoteVault, writeRemoteVault } from "./remoteVault";
import { ensureSyncTargetUnchanged, SyncTargetChangedError, SyncTargetIncompleteError, type SyncTargetInspection } from "./syncTarget";
import { createVault, rewrapVault, unlockVault, type VaultDocument, WrongPassphraseError } from "./vaultDocument";

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
  // このアプリが扱えるデータの形の版。指定しなければ DATA_FORMAT_VERSION。試験で新しいアプリを模すのに使う。
  dataFormatVersion?: number;
  // 新しく作る vault の、パスフレーズからキーを導出する重さ。指定しなければ製品の値（64 MiB）。
  // 試験では軽くする（何十回も導出するので、製品の値だと CI で時間切れになる）。
  kdfCost?: Omit<Argon2idParameters, "salt">;
  // 今の時刻。試験で時刻を進めるのに使う。
  now?: () => Date;
  // 同じ手元の保存を、ほかのウィンドウ（Web 版ならほかのタブ）も開くときに渡す。記録の書き込みをウィンドウをまたいで
  // 1 つずつ流す順番待ちと、書いた記録をほかのウィンドウへ知らせる通り道（どちらも、その vault の中だけで働く）。
  createWriteQueue?: (vaultId: string) => WriteQueue;
  createRecordChangeChannel?: (vaultId: string) => RecordChangeChannel;
  // 手元のデータを新しい形にしたあとで呼ぶ。同じ手元の保存を開いている、古い版のアプリのウィンドウ（Web 版の開いたままの
  // タブ）に知らせ、古い形で書き続けないようにする。
  announceDataFormat?: (version: number) => void;
};

export type UnlockedVault = {
  // この vault の ID。同期先に置かれたメモが、同じ vault のものかを見分けるのに使う。
  vaultId: string;
  // 取り出せない形の CryptoKey。設定の暗号化と、同期先を付け替えるときに使う。
  masterKey: CryptoKey;
  // この vault の手元の保存先。暗号化した設定（MCP など）の読み書きに使う。
  localStore: LocalStore;
  repository: NoteRepository;
  // 同期先を設定していなければ null。
  syncEngine: SyncEngine | null;
  remoteConfig: RemoteConfig | null;
};

export type VaultState = "absent" | "locked";

export async function readVaultState(localStore: LocalStore): Promise<VaultState> {
  return (await localStore.readSetting<VaultDocument>("vault")) ? "locked" : "absent";
}

export type DeviceDataSummary = {
  // メモとノートブックの数（中身はロック中は読めないので、種類は分けられない）。
  recordCount: number;
  // 同期先へまだ送っていない数。同期を設定していなければ、全部がこのデバイスにしか無い。
  waitingForPushCount: number;
  syncConfigured: boolean;
};

// このデバイスにあるデータの量。消す前の確認に出す。ロック中でも分かる範囲だけを返す。
export async function summarizeDeviceData(localStore: LocalStore): Promise<DeviceDataSummary> {
  const entries = await localStore.listRecordStates();
  return {
    recordCount: entries.length,
    waitingForPushCount: entries.filter((entry) => entry.waitingForPush).length,
    syncConfigured: (await localStore.readSetting<Uint8Array>("sealedRemoteConfig")) !== undefined,
  };
}

// このデバイスのデータ（メモ・添付・vault・同期先の設定）を消す。同期先のオブジェクトは消さない。
// ロックを解除していれば unlocked を渡す。保存待ちの入力を捨ててから消すので、書き戻されない。
export async function wipeDeviceData(localStore: LocalStore, unlocked: UnlockedVault | null): Promise<void> {
  await unlocked?.repository.close();
  await localStore.destroy();
}

// 同期先と、そこを画面で確かめたときの状態、そこで使う暗号化キー。
export type SyncTargetChoice = {
  remoteConfig: RemoteConfig;
  // 画面で確かめたときの状態（vault/syncTarget.ts）。保存の直前に、変わっていないかを確かめ直す。
  inspected: SyncTargetInspection;
  // 既存の同期先に参加するときは、そこの暗号化キー。
  // 空の同期先に作るときは、自分で決めた暗号化キー。null なら生成する。
  syncKey: string | null;
};

export type VaultEntry = {
  unlocked: UnlockedVault;
  // 暗号化キーを生成したときだけ値がある。1 度だけ利用者に見せ、どこにも保存しない。
  generatedSyncKey: string | null;
};

// 新しい vault を作る。同期先を指定したら、空であることを確かめて、暗号化キーで包んだ vault.json を置く。
export async function createNewVault(
  environment: VaultSessionEnvironment,
  input: { passphrase: string; syncTarget: SyncTargetChoice | null },
): Promise<VaultEntry> {
  const created = await createVault(input.passphrase, environment.kdfCost);
  // このアプリが扱う版で作る（試験で、古い版や新しい版のアプリを模すときも、その版で作る）。
  const document: VaultDocument = { ...created.document, bodySchema: environment.dataFormatVersion ?? DATA_FORMAT_VERSION };
  const { masterKey } = created;
  let generatedSyncKey: string | null = null;
  if (input.syncTarget) {
    if (input.syncTarget.inspected.state !== "empty") {
      throw new VaultAlreadyExistsError();
    }
    generatedSyncKey = await placeRemoteVault(environment, { document, passphrase: input.passphrase, syncTarget: input.syncTarget });
  }
  const remoteConfig = input.syncTarget?.remoteConfig ?? null;
  await saveVaultLocally(environment.localStore, { document, masterKey, remoteConfig });
  return { unlocked: await assembleUnlockedVault(environment, masterKey, remoteConfig), generatedSyncKey };
}

type PlaceRemoteVaultInput = { document: VaultDocument; passphrase: string; syncTarget: SyncTargetChoice };

// 空の同期先に、手元と同じマスターキーを暗号化キーで包んだ vault.json を置く。生成した暗号化キーを返す
// （自分で決めたものを使ったら null）。
async function placeRemoteVault(environment: VaultSessionEnvironment, input: PlaceRemoteVaultInput): Promise<string | null> {
  const { syncTarget } = input;
  const objectStore = environment.createObjectStore(syncTarget.remoteConfig);
  await ensureConditionalWrites(objectStore);
  await ensureSyncTargetUnchanged(objectStore, syncTarget.inspected);
  const syncKey = syncTarget.syncKey ?? newGeneratedPassphrase();
  const remoteDocument = await rewrapVault(input.document, input.passphrase, { secret: syncKey, wrapping: "syncKey" });
  try {
    await writeRemoteVault(objectStore, remoteDocument, { ifAbsent: true });
  } catch (error) {
    if (error instanceof PreconditionFailedError) {
      throw new SyncTargetChangedError();
    }
    // 書き込みは届いたのに ETag を読めなかった（CORS の ExposeHeaders に ETag が無い、WebDAV のサーバーが返さない）。置いたままにすると、
    // 誰も暗号化キーを見ていない vault.json が残り、次に確かめたときに「既存のメモ」に見える。
    if (error instanceof ObjectStoreError && (error.reason === "etag_hidden" || error.reason === "etag_missing")) {
      await objectStore.delete(VAULT_OBJECT_KEY).catch(() => undefined);
    }
    throw error;
  }
  return syncTarget.syncKey === null ? syncKey : null;
}

// ほかのデバイスで作った vault に、このデバイスを加える。同期先の vault.json を暗号化キーで開き、
// 同じマスターキーを、このデバイスのパスフレーズで包んで手元に置く。
export async function joinExistingVault(
  environment: VaultSessionEnvironment,
  input: { passphrase: string; syncTarget: SyncTargetChoice },
): Promise<VaultEntry> {
  const { remoteConfig, inspected, syncKey } = input.syncTarget;
  if (inspected.state !== "existing" || syncKey === null) {
    throw new VaultNotFoundError();
  }
  const objectStore = environment.createObjectStore(remoteConfig);
  await ensureConditionalWrites(objectStore);
  const stored = await readRemoteVault(objectStore);
  if (stored === null) {
    throw new VaultNotFoundError();
  }
  if (stored.etag !== inspected.vaultEtag) {
    throw new SyncTargetChangedError();
  }
  // 手元に何も書かないうちに確かめる（書いてから断ると、開けない vault が手元に残る）。
  ensureDataFormatSupported(stored.document.bodySchema, environment.dataFormatVersion ?? DATA_FORMAT_VERSION);
  const document = await rewrapVault(stored.document, syncKey, { secret: input.passphrase, wrapping: "passphrase" });
  const masterKey = await unlockVault(document, input.passphrase);
  await saveVaultLocally(environment.localStore, { document, masterKey, remoteConfig });
  return { unlocked: await assembleUnlockedVault(environment, masterKey, remoteConfig), generatedSyncKey: null };
}

// 入れた文字が、このデバイスのパスフレーズかを確かめる（スペースを消す前などの確認）。違えば WrongPassphraseError。
// 開いた鍵は使わずに捨てる。
export async function verifyPassphrase(environment: VaultSessionEnvironment, passphrase: string): Promise<void> {
  await unlockVault(await readLocalVaultDocument(environment.localStore), passphrase);
}

export async function unlockLocalVault(environment: VaultSessionEnvironment, passphrase: string): Promise<UnlockedVault> {
  const document = await readLocalVaultDocument(environment.localStore);
  return reopenLocalVault(environment, await unlockVault(document, passphrase));
}

// もう開いてあるマスターキーで、手元の vault を開き直す（スペースを切り替えて戻ったとき。パスフレーズは聞かない）。
export async function reopenLocalVault(environment: VaultSessionEnvironment, masterKey: CryptoKey): Promise<UnlockedVault> {
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
  const dataFormatVersion = environment.dataFormatVersion ?? DATA_FORMAT_VERSION;
  const { vaultId, bodySchema: storedDataFormat } = await readLocalVaultDocument(localStore);
  // メモを読む前に確かめる。このアプリより新しい形なら開かない（開くと、エディタが知らないノードを消す）。
  ensureDataFormatSupported(storedDataFormat, dataFormatVersion);
  const deviceId = (await localStore.readSetting<string>("deviceId")) ?? newRandomId();
  // 添付の取得は同期の部品が行い、同期の部品は記録の書き込みに repository を使う。
  // 互いを使うので、repository を先に作り、添付の取得はあとから作る syncEngine へ回す。
  let syncEngine: SyncEngine | null = null;
  const repository = new NoteRepository({
    localStore,
    masterKey,
    deviceId,
    writeQueue: environment.createWriteQueue?.(vaultId) ?? new SerialQueue(),
    recordChangeChannel: environment.createRecordChangeChannel?.(vaultId),
    downloadBlob: (id) => syncEngine?.downloadBlob(id) ?? Promise.resolve(null),
    downloadVersions: (noteId) => syncEngine?.downloadVersions(noteId) ?? Promise.resolve(),
    now: environment.now,
  });
  if (remoteConfig) {
    syncEngine = new SyncEngine({ localStore, objectStore: environment.createObjectStore(remoteConfig), repository, dataFormatVersion, masterKey, now: environment.now });
  }
  await repository.load();
  if (storedDataFormat < dataFormatVersion) {
    await migrateLocalDataFormat(environment, { repository, storedDataFormat, dataFormatVersion });
  }
  return { vaultId, masterKey, localStore, repository, syncEngine, remoteConfig };
}

type LocalDataFormatMigration = { repository: NoteRepository; storedDataFormat: number; dataFormatVersion: number };

// 手元の記録を、このアプリのデータの形にしてから、手元の vault の版を引き上げる（手順は format/dataFormatMigrations.ts）。
// 全部の手順が済んでから版を書くので、途中で止まっても、次の解除でもう一度流れる。
// 同期先の vault.json は、次の同期の始めに引き上げる（引き上げてから、書き換えた記録を送る）。
async function migrateLocalDataFormat(environment: VaultSessionEnvironment, migration: LocalDataFormatMigration): Promise<void> {
  const { repository, storedDataFormat, dataFormatVersion } = migration;
  for (const step of migrationsBetween(storedDataFormat, dataFormatVersion)) {
    await repository.migrateRecords(step.migrateRecord);
  }
  // 手順の間に、ほかのウィンドウの同期が版を引き上げているかもしれないので、読み直してから書く。
  const document = await readLocalVaultDocument(environment.localStore);
  if (document.bodySchema < dataFormatVersion) {
    await environment.localStore.writeSetting("vault", { ...document, bodySchema: dataFormatVersion });
  }
  environment.announceDataFormat?.(dataFormatVersion);
}

// ロック解除中に同期先を設定する（または付け替える）。空の同期先なら vault.json を置き、既存の同期先なら
// 同じ vault かを確かめる。別の vault のバケットには混ぜない。
// 空の同期先に置くには、マスターキーを暗号化キーで包み直すので、このデバイスのパスフレーズが要る。
export async function connectRemote(
  environment: VaultSessionEnvironment,
  unlocked: UnlockedVault,
  input: { syncTarget: SyncTargetChoice; passphrase: string | null },
): Promise<VaultEntry> {
  const { remoteConfig, inspected } = input.syncTarget;
  const document = await readLocalVaultDocument(environment.localStore);
  let generatedSyncKey: string | null = null;
  if (inspected.state === "incomplete") {
    throw new SyncTargetIncompleteError();
  }
  if (inspected.state === "existing") {
    if (inspected.vaultId !== unlocked.vaultId) {
      throw new VaultAlreadyExistsError();
    }
    const objectStore = environment.createObjectStore(remoteConfig);
    await ensureConditionalWrites(objectStore);
    await ensureSyncTargetUnchanged(objectStore, inspected);
  } else {
    if (input.passphrase === null) {
      throw new WrongPassphraseError();
    }
    generatedSyncKey = await placeRemoteVault(environment, { document, passphrase: input.passphrase, syncTarget: input.syncTarget });
    // 新しい同期先には添付が 1 つも無い。前の同期先へ送り終えた添付も、送り直す
    // （記録は、同期先に無ければ同期の中で送り直しになる）。
    await environment.localStore.markAllBlobsForUpload();
    await environment.localStore.markAllVersionsForUpload();
    if (unlocked.remoteConfig) {
      await copyRemoteBlobs(environment.createObjectStore(unlocked.remoteConfig), environment.createObjectStore(remoteConfig));
    }
  }
  await saveVaultLocally(environment.localStore, { document, masterKey: unlocked.masterKey, remoteConfig });
  return { unlocked: await assembleUnlockedVault(environment, unlocked.masterKey, remoteConfig), generatedSyncKey };
}

// 前の同期先の添付を、新しい同期先へ写す。添付は開いたときに取ってくるので、このデバイスが持っていない
// 添付（ほかのデバイスが貼って、ここではまだ開いていないもの）は、手元から送り直せない。
// 添付はマスターキーで暗号化してあり、マスターキーは同じなので、暗号文のまま写せば読める。
// 前の同期先につながらなければ、写さずに進む（手元にある添付は、同期で送り直す）。
async function copyRemoteBlobs(previous: ObjectStore, next: ObjectStore): Promise<void> {
  try {
    for (const { key } of await previous.list(BLOBS_PREFIX)) {
      const stored = await previous.get(key);
      if (stored !== null) {
        await next.put(key, stored.body, { ifAbsent: true }).catch((error: unknown) => {
          // 既にあれば、写し終えたのと同じ。
          if (!(error instanceof PreconditionFailedError)) {
            throw error;
          }
        });
      }
    }
  } catch (error) {
    if (!(error instanceof ObjectStoreError)) {
      throw error;
    }
  }
}

// 同期先の暗号化キーを作り直す。vault.json を新しいキーで包み直すだけで、メモは暗号化し直さない。
// 参加済みのデバイスは、手元にマスターキーを持っているので、そのまま同期を続けられる。新しく参加する
// デバイスは、新しいキーを使う。
// 生成した暗号化キーを返す（自分で決めたものを使ったら null）。
export async function replaceSyncKey(
  environment: VaultSessionEnvironment,
  unlocked: UnlockedVault,
  input: { passphrase: string; syncKey: string | null },
): Promise<string | null> {
  if (!unlocked.remoteConfig) {
    throw new VaultNotFoundError();
  }
  const document = await readLocalVaultDocument(environment.localStore);
  const objectStore = environment.createObjectStore(unlocked.remoteConfig);
  const existing = await readRemoteVault(objectStore);
  if (existing?.document.vaultId !== document.vaultId) {
    throw new VaultNotFoundError();
  }
  const syncKey = input.syncKey ?? newGeneratedPassphrase();
  const rewrapped = await rewrapVault(document, input.passphrase, { secret: syncKey, wrapping: "syncKey" });
  try {
    // データの形の版は、同期先の値を保つ（手元より新しいことがある）。
    await writeRemoteVault(objectStore, { ...rewrapped, bodySchema: existing.document.bodySchema }, { ifMatch: existing.etag });
  } catch (error) {
    throw error instanceof PreconditionFailedError ? new SyncTargetChangedError() : error;
  }
  return input.syncKey === null ? syncKey : null;
}

// このデバイスのパスフレーズを変える。手元の vault を包み直すだけで、同期先とほかのデバイスは変わらない。
export async function changePassphrase(
  environment: VaultSessionEnvironment,
  passphrases: { current: string; next: string },
): Promise<void> {
  const document = await readLocalVaultDocument(environment.localStore);
  const changed = await rewrapVault(document, passphrases.current, { secret: passphrases.next, wrapping: "passphrase" });
  await environment.localStore.writeSetting("vault", changed);
}

async function readLocalVaultDocument(localStore: LocalStore): Promise<VaultDocument> {
  const document = await localStore.readSetting<VaultDocument>("vault");
  if (!document) {
    throw new VaultNotFoundError();
  }
  return document;
}
