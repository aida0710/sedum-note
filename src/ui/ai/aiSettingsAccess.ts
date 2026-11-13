// アプリ内の AI の設定を、画面（設定の欄と、メモの AI アシスタント）から読み書きするための入口。
// ロックを解除した保管庫が要るので、解除したあとの画面の上で配る。

import { createContext, useContext, useMemo } from "react";
import { type AiSettings, readAiSettings, writeAiSettings } from "../../core/vault/aiSettings";
import type { UnlockedVault } from "../../core/vault/vaultSession";
import { useStoredValue } from "../shared/useStoredValue";

export type AiSettingsAccess = {
  // 読み込みが済むまでは null。
  settings: AiSettings | null;
  // 今の設定から次の設定を作って保存する。今の設定は、先に呼んだ変更が済んだあとのもの（shared/useStoredValue.ts）。
  updateSettings: (change: (current: AiSettings) => AiSettings) => Promise<void>;
};

export const AiSettingsContext = createContext<AiSettingsAccess>({ settings: null, updateSettings: () => Promise.resolve() });

export function useAiSettingsOfVault(vault: UnlockedVault): AiSettingsAccess {
  const source = useMemo(() => ({
    read: () => readAiSettings(vault.localStore, vault.masterKey),
    write: (settings: AiSettings) => writeAiSettings(vault.localStore, vault.masterKey, settings),
  }), [vault]);
  const { value, update } = useStoredValue(source);
  return { settings: value, updateSettings: update };
}

export function useAiSettings(): AiSettingsAccess {
  return useContext(AiSettingsContext);
}
