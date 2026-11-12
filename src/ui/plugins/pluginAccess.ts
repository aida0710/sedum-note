// 取り込んだプラグインを、画面（設定の欄と、メモのメニュー）から読み書きするための入口。
// ロックを解除した保管庫が要るので、解除したあとの画面の上で配る。

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { type InstalledPlugin, readInstalledPlugins, writeInstalledPlugins } from "../../core/plugins/installedPlugins";
import type { UnlockedVault } from "../../core/vault/vaultSession";

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
  const [plugins, setPlugins] = useState<InstalledPlugin[] | null>(null);
  useEffect(() => {
    let current = true;
    void readInstalledPlugins(vault.localStore, vault.masterKey).then((stored) => current && setPlugins(stored));
    return () => { current = false; };
  }, [vault]);
  // いまの一覧。続けて操作しても、前の操作の結果の上に重ねられるように、描くのを待たずに持つ。
  const latest = useRef<InstalledPlugin[]>([]);
  latest.current = plugins ?? latest.current;
  // 画面には先に反映し、そのあと手元に書く（チェックを付けた直後に、前の状態へ戻って見えないように）。
  const save = useCallback(async (change: (installed: InstalledPlugin[]) => InstalledPlugin[]) => {
    const next = change(latest.current);
    latest.current = next;
    setPlugins(next);
    await writeInstalledPlugins(vault.localStore, vault.masterKey, next);
  }, [vault]);
  return {
    plugins,
    installPlugin: (plugin) => save((installed) => [...installed.filter((other) => other.manifest.id !== plugin.manifest.id), plugin]),
    removePlugin: (pluginId) => save((installed) => installed.filter((plugin) => plugin.manifest.id !== pluginId)),
    setPluginEnabled: (pluginId, enabled) => save((installed) => installed.map((plugin) => (plugin.manifest.id === pluginId ? { ...plugin, enabled } : plugin))),
  };
}

export function usePlugins(): PluginAccess {
  return useContext(PluginAccessContext);
}

// GitHub への要求の送り方。認証情報も、アプリや利用者を見分ける値も付けない。
export function sendPluginRequest(url: string, headers: Record<string, string>): Promise<Response> {
  return fetch(url, { headers, credentials: "omit", referrerPolicy: "no-referrer", cache: "no-store" });
}
