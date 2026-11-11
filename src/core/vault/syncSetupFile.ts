// 同期の設定を、ほかのデバイスへ渡すための文書（ファイルや QR にする）。
//
// 中身は 2 つ。
//   vault                同期先の vault.json の写し（暗号化キーで包んだマスターキー）
//   sealedRemoteConfig   同期先の設定（アクセスキーを含む）を、マスターキーで暗号化したもの
// 書き出す側は、ロック解除中に持っているマスターキーで設定を暗号化するので、暗号化キーを入力しなくてよい
// （アプリは暗号化キーを持っていない）。取り込む側は、暗号化キーで vault からマスターキーを取り出し、
// それで設定を開く。暗号化キーが無ければ何も読めないので、QR にして画面に出してよい。

import { base64ToBytes, bytesToBase64 } from "../crypto/base64";
import { open, seal, SealedBoxError } from "../crypto/sealedBox";
import { findRemoteConfigProblem, type RemoteConfig } from "../remote/remoteConfig";
import { readRemoteVault } from "./remoteVault";
import { InvalidVaultDocumentError, keyWrappingOf, parseVaultDocument, serializeVaultDocument, unlockVault } from "./vaultDocument";
import { type UnlockedVault, VaultNotFoundError, type VaultSessionEnvironment } from "./vaultSession";

const SYNC_SETUP_FORMAT = "sedum-note-sync-setup";
const SYNC_SETUP_VERSION = 1;
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export class InvalidSyncSetupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidSyncSetupError";
  }
}

function remoteConfigBinding(vaultId: string): string {
  return `sync-setup:${vaultId}:remote-config`;
}

// 設定してある同期先の設定を、渡すための文書にする。同期先の今の vault.json を読んで入れるので、
// 暗号化キーを作り直したあとに書き出したものは、新しい暗号化キーで開く。
export async function exportSyncSetup(environment: VaultSessionEnvironment, unlocked: UnlockedVault): Promise<string> {
  const { remoteConfig } = unlocked;
  if (!remoteConfig) {
    throw new VaultNotFoundError();
  }
  const stored = await readRemoteVault(environment.createObjectStore(remoteConfig));
  if (stored?.document.vaultId !== unlocked.vaultId) {
    throw new VaultNotFoundError();
  }
  const sealed = await seal(unlocked.masterKey, textEncoder.encode(JSON.stringify(remoteConfig)), remoteConfigBinding(unlocked.vaultId));
  return JSON.stringify({
    format: SYNC_SETUP_FORMAT,
    version: SYNC_SETUP_VERSION,
    vault: JSON.parse(serializeVaultDocument(stored.document)) as unknown,
    sealedRemoteConfig: bytesToBase64(sealed),
  });
}

// 渡された文書を暗号化キーで開き、同期先の設定を返す。暗号化キーが違えば WrongSyncKeyError。
export async function openSyncSetup(text: string, syncKey: string): Promise<RemoteConfig> {
  const { vaultText, sealedRemoteConfig } = parseSyncSetup(text);
  let document;
  try {
    document = parseVaultDocument(vaultText);
  } catch (error) {
    throw error instanceof InvalidVaultDocumentError ? new InvalidSyncSetupError("the sync setup holds no readable vault") : error;
  }
  if (keyWrappingOf(document) !== "syncKey") {
    throw new InvalidSyncSetupError("the sync setup holds a vault that is not wrapped by an encryption key");
  }
  const masterKey = await unlockVault(document, syncKey);
  let remoteConfig: RemoteConfig;
  try {
    remoteConfig = JSON.parse(textDecoder.decode(await open(masterKey, sealedRemoteConfig, remoteConfigBinding(document.vaultId)))) as RemoteConfig;
  } catch (error) {
    // マスターキーは開けたのに設定が開けない。別の vault の文書と組み替えられている。
    throw error instanceof SealedBoxError || error instanceof SyntaxError
      ? new InvalidSyncSetupError("the sync setup's settings do not belong to its vault")
      : error;
  }
  // 中身は書き出したデバイスが検査済みのはずだが、古い版や壊れた文書でおかしな接続先へつながないよう確かめる。
  if (findRemoteConfigProblem(remoteConfig) !== null) {
    throw new InvalidSyncSetupError("the sync setup holds settings this app does not accept");
  }
  return remoteConfig;
}

// 読んだ文字が、同期の設定の文書か（QR やファイルの取り違えに、暗号化キーを聞く前に気づけるようにする）。
export function isSyncSetup(text: string): boolean {
  try {
    parseSyncSetup(text);
    return true;
  } catch {
    return false;
  }
}

function parseSyncSetup(text: string): { vaultText: string; sealedRemoteConfig: Uint8Array } {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new InvalidSyncSetupError("the sync setup is not JSON");
  }
  const candidate = (typeof value === "object" && value !== null ? value : {}) as Record<string, unknown>;
  if (candidate.format !== SYNC_SETUP_FORMAT || candidate.version !== SYNC_SETUP_VERSION ||
    typeof candidate.vault !== "object" || candidate.vault === null || typeof candidate.sealedRemoteConfig !== "string") {
    throw new InvalidSyncSetupError("this is not a sync setup of a supported version");
  }
  return { vaultText: JSON.stringify(candidate.vault), sealedRemoteConfig: base64ToBytes(candidate.sealedRemoteConfig) };
}
