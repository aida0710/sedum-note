// 取り込んだプラグインの一覧を、手元に置く・読む。プラグインはメモを読むコードなので、マスターキーで暗号化して置き
// （ロックしている間に、手元のファイルを書き換えて差し替えられない）、実行の前に、取り込んだときのハッシュと比べる。
// スペース（vault）ごとの設定で、同期もバックアップもしない。

import { base64ToBytes, bytesToBase64 } from "../crypto/base64";
import { bytesToHex } from "../crypto/hex";
import { open, seal } from "../crypto/sealedBox";
import type { LocalStore } from "../local/localStore";
import type { PluginManifest } from "./pluginManifest";
import type { PluginPackage, PluginSource } from "./pluginSource";

const PLUGINS_BINDING = "settings:plugins";
const PLUGINS_SETTING_NAME = "sealedPlugins";
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export type InstalledPlugin = {
  manifest: PluginManifest;
  // 取り込み元と、取り込んだコミット。「更新を確かめる」で、取り込み元の今のコミットと比べる。
  source: PluginSource;
  commitSha: string;
  // モジュールのバイト列の SHA-256（16 進）。取り込みの確認の画面に出し、実行の前に確かめる。
  moduleSha256: string;
  moduleBytes: Uint8Array;
  // 切ると、コマンドを出さない（取り込んだものは残す）。
  enabled: boolean;
};

type StoredPlugin = Omit<InstalledPlugin, "moduleBytes"> & { moduleBase64: string };

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  return bytesToHex(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes as Uint8Array<ArrayBuffer>)));
}

export async function installedPluginFrom(fetched: PluginPackage, source: PluginSource): Promise<InstalledPlugin> {
  return {
    manifest: fetched.manifest, source, commitSha: fetched.commitSha,
    moduleSha256: await sha256Hex(fetched.moduleBytes), moduleBytes: fetched.moduleBytes, enabled: true,
  };
}

export async function readInstalledPlugins(localStore: LocalStore, masterKey: CryptoKey): Promise<InstalledPlugin[]> {
  const sealed = await localStore.readSetting<Uint8Array>(PLUGINS_SETTING_NAME);
  if (!sealed) {
    return [];
  }
  const stored = JSON.parse(textDecoder.decode(await open(masterKey, sealed, PLUGINS_BINDING))) as StoredPlugin[];
  return stored.map(({ moduleBase64, ...plugin }) => ({ ...plugin, moduleBytes: base64ToBytes(moduleBase64) }));
}

export async function writeInstalledPlugins(localStore: LocalStore, masterKey: CryptoKey, plugins: InstalledPlugin[]): Promise<void> {
  const stored: StoredPlugin[] = plugins.map(({ moduleBytes, ...plugin }) => ({ ...plugin, moduleBase64: bytesToBase64(moduleBytes) }));
  await localStore.writeSetting(PLUGINS_SETTING_NAME, await seal(masterKey, textEncoder.encode(JSON.stringify(stored)), PLUGINS_BINDING));
}
