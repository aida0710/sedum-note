// アプリ内の AI の設定を、画面（設定の欄と、メモの AI アシスタント）から読み書きするための入口。
// ロックを解除した保管庫が要るので、解除したあとの画面の上で配る。

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { type AiSettings, readAiSettings, writeAiSettings } from "../../core/vault/aiSettings";
import type { UnlockedVault } from "../../core/vault/vaultSession";

export type AiSettingsAccess = {
  // 読み込みが済むまでは null。
  settings: AiSettings | null;
  saveSettings: (settings: AiSettings) => Promise<void>;
};

export const AiSettingsContext = createContext<AiSettingsAccess>({ settings: null, saveSettings: () => Promise.resolve() });

export function useAiSettingsOfVault(vault: UnlockedVault): AiSettingsAccess {
  const [settings, setSettings] = useState<AiSettings | null>(null);
  useEffect(() => {
    let current = true;
    void readAiSettings(vault.localStore, vault.masterKey).then((stored) => current && setSettings(stored));
    return () => { current = false; };
  }, [vault]);
  const saveSettings = useCallback(async (next: AiSettings) => {
    await writeAiSettings(vault.localStore, vault.masterKey, next);
    setSettings(next);
  }, [vault]);
  return { settings, saveSettings };
}

export function useAiSettings(): AiSettingsAccess {
  return useContext(AiSettingsContext);
}
