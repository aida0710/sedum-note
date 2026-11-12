// 全部のスペース（spaceRegistry.ts）にまたがる操作。パスフレーズはこのデバイスで共通なので、確かめるとき・変えるとき・
// データを消すときは、全部のスペースの手元の保存を相手にする。
// ロックを解除したスペースのマスターキーは、ロックするまでメモリに持つ（スペースを切り替えて戻ったときに、パスフレーズを聞かない）。

import { changePassphrase, type DeviceDataSummary, readVaultState, summarizeDeviceData, verifyPassphrase } from "../../core/vault/vaultSession";
import { createAppEnvironment } from "./appEnvironment";
import { readSpaceRegistry, resetSpaceRegistry } from "./spaceRegistry";

const unlockedMasterKeys = new Map<string, CryptoKey>();

export function rememberUnlockedSpace(spaceId: string, masterKey: CryptoKey): void {
  unlockedMasterKeys.set(spaceId, masterKey);
}

export function masterKeyOfUnlockedSpace(spaceId: string): CryptoKey | null {
  return unlockedMasterKeys.get(spaceId) ?? null;
}

// ロックしたときに呼ぶ。全部のスペースが、パスフレーズを入れるまで開けなくなる。
export function forgetUnlockedSpaces(): void {
  unlockedMasterKeys.clear();
}

export function forgetUnlockedSpace(spaceId: string): void {
  unlockedMasterKeys.delete(spaceId);
}

// vault を作ってあるスペースの環境（設定の途中のスペースは除く）。
async function environmentsWithVault(exceptSpaceId: string | null) {
  const environments = [];
  for (const space of readSpaceRegistry().spaces) {
    if (space.id === exceptSpaceId) {
      continue;
    }
    const environment = createAppEnvironment(space.id);
    if (await readVaultState(environment.localStore) !== "absent") {
      environments.push(environment);
    }
  }
  return environments;
}

// 入れた文字が、このデバイスのパスフレーズ（ほかのスペースを開けるもの）かを確かめる。スペースを足すときに使う。
// 違えば WrongPassphraseError。ほかのスペースがまだ無ければ、何も確かめない。
export async function verifyPassphraseOfOtherSpaces(newSpaceId: string, passphrase: string): Promise<void> {
  const [existing] = await environmentsWithVault(newSpaceId);
  if (existing) {
    await verifyPassphrase(existing, passphrase);
  }
}

// このデバイスのパスフレーズを変える。全部のスペースの vault を包み直す。先に、今のパスフレーズで全部を開けることを確かめる
// （途中で失敗して、スペースごとにパスフレーズが分かれないように）。
export async function changePassphraseOfAllSpaces(passphrases: { current: string; next: string }): Promise<void> {
  const environments = await environmentsWithVault(null);
  for (const environment of environments) {
    await verifyPassphrase(environment, passphrases.current);
  }
  for (const environment of environments) {
    await changePassphrase(environment, passphrases);
  }
}

// 全部のスペースを消したときに失われるものを、消す前の確認に出す形でまとめる。同期していないスペースのメモは全部、
// 同期しているスペースのメモは、まだ送っていない分が失われる。
export async function summarizeAllSpaces(): Promise<DeviceDataSummary> {
  let recordCount = 0;
  let lostCount = 0;
  let syncConfigured = false;
  for (const space of readSpaceRegistry().spaces) {
    const summary = await summarizeDeviceData(createAppEnvironment(space.id).localStore);
    recordCount += summary.recordCount;
    lostCount += summary.syncConfigured ? summary.waitingForPushCount : summary.recordCount;
    syncConfigured ||= summary.syncConfigured;
  }
  return { recordCount, waitingForPushCount: lostCount, syncConfigured };
}

// スペースの手元の保存を消す（同期先は消さない）。
export async function destroySpaceData(spaceId: string): Promise<void> {
  forgetUnlockedSpace(spaceId);
  await createAppEnvironment(spaceId).localStore.destroy();
}

// いま開いているスペースのほかの、全部のスペースの手元の保存を消し、スペースの一覧を最初の状態に戻す
// （「このデバイスのデータを消す」。開いているスペースは、呼び出し側が、保存待ちの入力を捨ててから消す）。
export async function destroyOtherSpaces(openSpaceId: string): Promise<void> {
  for (const space of readSpaceRegistry().spaces) {
    if (space.id !== openSpaceId) {
      await destroySpaceData(space.id);
    }
  }
  forgetUnlockedSpaces();
  resetSpaceRegistry();
}
