// 試験で、同期するデバイスを用意する手順（同期先を確かめてから、作る・参加する・つなぐ）をまとめたもの。
// 画面は「接続を確認」のあとに保存するので、試験も同じ順に呼ぶ。

import type { RemoteConfig } from "../remote/remoteConfig";
import { inspectSyncTarget } from "./syncTarget";
import { connectRemote, createNewVault, joinExistingVault, type UnlockedVault, type VaultSessionEnvironment } from "./vaultSession";

// 試験で使う、軽い鍵の導出。形式は製品と同じ。VaultSessionEnvironment の kdfCost に渡す。
export const TEST_KDF_COST = { iterations: 1, memoryKiB: 64, parallelism: 1 };

// 試験の同期先で使う、自分で決めた暗号化キー。
export const TEST_SYNC_KEY = "shared-sync-key-for-tests";

type SyncedDeviceInput = { passphrase: string; remoteConfig: RemoteConfig; syncKey?: string };

async function checkedSyncTarget(environment: VaultSessionEnvironment, { remoteConfig, syncKey = TEST_SYNC_KEY }: SyncedDeviceInput) {
  return { remoteConfig, inspected: await inspectSyncTarget(environment.createObjectStore(remoteConfig)), syncKey };
}

export async function createSyncedVault(environment: VaultSessionEnvironment, input: SyncedDeviceInput): Promise<UnlockedVault> {
  const syncTarget = await checkedSyncTarget(environment, input);
  return (await createNewVault(environment, { passphrase: input.passphrase, syncTarget })).unlocked;
}

export async function joinSyncedVault(environment: VaultSessionEnvironment, input: SyncedDeviceInput): Promise<UnlockedVault> {
  const syncTarget = await checkedSyncTarget(environment, input);
  return (await joinExistingVault(environment, { passphrase: input.passphrase, syncTarget })).unlocked;
}

export async function createLocalVault(environment: VaultSessionEnvironment, passphrase: string): Promise<UnlockedVault> {
  return (await createNewVault(environment, { passphrase, syncTarget: null })).unlocked;
}

export async function connectSyncedRemote(environment: VaultSessionEnvironment, unlocked: UnlockedVault, input: SyncedDeviceInput): Promise<UnlockedVault> {
  const syncTarget = await checkedSyncTarget(environment, input);
  return (await connectRemote(environment, unlocked, { syncTarget, passphrase: input.passphrase })).unlocked;
}
