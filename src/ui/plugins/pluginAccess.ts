// 取り込んだプラグインを、画面（設定の欄と、メモのメニュー）から読み書きするための入口。
// ロックを解除した保管庫が要るので、解除したあとの画面の上で配る。

import { createContext, useContext, useMemo } from "react";
import { type InstalledPlugin, readInstalledPlugins, writeInstalledPlugins } from "../../core/plugins/installedPlugins";
import type { UnlockedVault } from "../../core/vault/vaultSession";
import { useStoredValue } from "../shared/useStoredValue";

export type PluginAccess = {
  // 読み込みが済むまでは null。
  plugins: InstalledPlugin[] | null;
  // 取り込む。同じ ID のプラグインがあれば、入れ替える（更新）。
  installPlugin: (plugin: InstalledPlugin) => Promise<void>;
  removePlugin: (pluginId: string) => Promise<void>;
  setPluginEnabled: (pluginId: string, enabled: boolean) => Promise<void>;
};

const NO_PLUGINS: PluginAccess = {
  plugins: null, installPlugin: () => Promise.resolve(), removePlugin: () => Promise.resolve(), setPluginEnabled: () => Promise.resolve(),
};

export const PluginAccessContext = createContext<PluginAccess>(NO_PLUGINS);

export function usePluginsOfVault(vault: UnlockedVault): PluginAccess {
  const source = useMemo(() => ({
    read: () => readInstalledPlugins(vault.localStore, vault.masterKey),
    write: (plugins: InstalledPlugin[]) => writeInstalledPlugins(vault.localStore, vault.masterKey, plugins),
  }), [vault]);
  // 続けて操作しても、前の操作の結果の上に重ねる（shared/useStoredValue.ts）。
  const { value: plugins, update } = useStoredValue(source);
  return {
    plugins,
    installPlugin: (plugin) => update((installed) => [...installed.filter((other) => other.manifest.id !== plugin.manifest.id), plugin]),
    removePlugin: (pluginId) => update((installed) => installed.filter((plugin) => plugin.manifest.id !== pluginId)),
    setPluginEnabled: (pluginId, enabled) => update((installed) => installed.map((plugin) => (plugin.manifest.id === pluginId ? { ...plugin, enabled } : plugin))),
  };
}

export function usePlugins(): PluginAccess {
  return useContext(PluginAccessContext);
}

// GitHub への要求の送り方。認証情報も、アプリや利用者を見分ける値も付けない。
export function sendPluginRequest(url: string, headers: Record<string, string>): Promise<Response> {
  return fetch(url, { headers, credentials: "omit", referrerPolicy: "no-referrer", cache: "no-store" });
}
