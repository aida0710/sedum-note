// 同期先の今の状態を確かめる。設定を保存する前に、何がそこにあるかを見て、それに合った手順（新しく作る・
// 既存のメモに参加する）を選ぶ。sshc の同期の設定と同じ考え方で、確かめたあとに同期先が変わっていたら保存しない。

import { type ObjectStore, ObjectStoreError } from "../remote/objectStore";
import { normalizePrefix, type RemoteConfig } from "../remote/remoteConfig";
import { RECORDS_PREFIX, VAULT_OBJECT_KEY } from "../sync/remoteLayout";
import { readRemoteVault } from "./remoteVault";
import { InvalidVaultDocumentError, keyWrappingOf, parseVaultDocument } from "./vaultDocument";

export type SyncTargetInspection =
  // 何も無い。ここに新しく作れる。
  | { state: "empty" }
  // 既存のメモがある。その暗号化キーを入れると参加できる。
  | { state: "existing"; vaultId: string; vaultEtag: string }
  // メモはあるのに vault.json が無い。どのキーで暗号化したものか分からないので、ここには作らせない。
  | { state: "incomplete" };

export class SyncTargetChangedError extends Error {
  constructor() {
    super("the storage changed after it was checked; check it again");
    this.name = "SyncTargetChangedError";
  }
}

export class SyncTargetIncompleteError extends Error {
  constructor() {
    super("the storage has notes but no vault; use an empty folder");
    this.name = "SyncTargetIncompleteError";
  }
}

export async function inspectSyncTarget(objectStore: ObjectStore): Promise<SyncTargetInspection> {
  const stored = await readRemoteVault(objectStore);
  if (stored !== null) {
    return { state: "existing", vaultId: stored.document.vaultId, vaultEtag: stored.etag };
  }
  return (await objectStore.hasObjectsUnder(RECORDS_PREFIX)) ? { state: "incomplete" } : { state: "empty" };
}

// 画面で確かめたときと同じ状態かを、保存の直前に確かめ直す。
export async function ensureSyncTargetUnchanged(objectStore: ObjectStore, expected: SyncTargetInspection): Promise<void> {
  const current = await inspectSyncTarget(objectStore);
  const unchanged = current.state === expected.state &&
    (current.state !== "existing" || (expected.state === "existing" && current.vaultEtag === expected.vaultEtag));
  if (!unchanged) {
    throw new SyncTargetChangedError();
  }
}

// 1 つのバケットで探すフォルダの数の上限。それより多いバケットでは、フォルダを入力してもらう。
const MAX_FOLDERS_TO_SEARCH = 50;

// バケットの直下と、そのすぐ下のフォルダから、メモの置いてある場所（vault.json のある prefix）を探す。
// 直下にあれば "" を返す。2 段より深い場所は探さない。bucketRoot は、prefix を空にした同期先。
export async function findVaultFolders(bucketRoot: ObjectStore): Promise<string[]> {
  const folders = ["", ...(await bucketRoot.listFolders("", MAX_FOLDERS_TO_SEARCH))];
  const found = await Promise.all(folders.map(async (folder) => {
    try {
      const stored = await bucketRoot.get(folder === "" ? VAULT_OBJECT_KEY : `${folder}/${VAULT_OBJECT_KEY}`);
      if (stored === null) {
        return null;
      }
      // ほかの用途の vault.json と、v0.2 までの形（参加できない）は数えない。
      return keyWrappingOf(parseVaultDocument(new TextDecoder().decode(stored.body))) === "syncKey" ? folder : null;
    } catch (error) {
      if (error instanceof InvalidVaultDocumentError) {
        return null;
      }
      throw error;
    }
  }));
  return found.filter((folder) => folder !== null);
}

// フォルダ探しは、参加を楽にするための付け足し。アクセスキーが 1 つのフォルダにしか届かない設定では、
// バケットの直下を見られない。そのときは、見つからなかったことにして、入力した場所に作れるようにする。
async function findVaultFoldersIfAllowed(bucketRoot: ObjectStore): Promise<string[]> {
  try {
    return await findVaultFolders(bucketRoot);
  } catch (error) {
    if (error instanceof ObjectStoreError) {
      return [];
    }
    throw error;
  }
}

export type SyncTargetCheck = {
  // 確かめた同期先（フォルダを見つけて入れ替えたときは、入れ替えたあとのもの）。
  remoteConfig: RemoteConfig;
  inspected: SyncTargetInspection;
  // 入力したフォルダが空だったときに、同じバケットのほかの場所で見つかった既存のメモ。
  otherVaultFolders: string[];
  // フォルダを入力していなくて、既存のメモが 1 か所だけ見つかったので、そこを使うことにした。
  foundFolderAutomatically: boolean;
};

// 画面の「接続を確認」。入力した場所の状態を見る。そこが空なら、同じバケットから既存のメモを探す。
// フォルダを入力していなくて、既存のメモが 1 か所だけなら、そこを同期先にする（フォルダを覚えていなくても参加できる）。
export async function checkSyncTarget(createObjectStore: (config: RemoteConfig) => ObjectStore, remoteConfig: RemoteConfig): Promise<SyncTargetCheck> {
  const inspected = await inspectSyncTarget(createObjectStore(remoteConfig));
  if (inspected.state !== "empty") {
    return { remoteConfig, inspected, otherVaultFolders: [], foundFolderAutomatically: false };
  }
  const typedFolder = normalizePrefix(remoteConfig.prefix);
  const otherVaultFolders = (await findVaultFoldersIfAllowed(createObjectStore({ ...remoteConfig, prefix: "" }))).filter((folder) => folder !== typedFolder);
  const [onlyFolder] = otherVaultFolders;
  if (typedFolder === "" && otherVaultFolders.length === 1 && onlyFolder !== undefined) {
    const found = { ...remoteConfig, prefix: onlyFolder };
    return { remoteConfig: found, inspected: await inspectSyncTarget(createObjectStore(found)), otherVaultFolders: [], foundFolderAutomatically: true };
  }
  return { remoteConfig, inspected, otherVaultFolders, foundFolderAutomatically: false };
}
