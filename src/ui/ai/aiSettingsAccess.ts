// アプリ内の AI の設定を、画面（設定の欄と、メモの AI アシスタント）から読み書きするための入口。
// ロックを解除した保管庫が要るので、解除したあとの画面の上で配る。

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { SerialQueue } from "../../core/local/serialQueue";
import { type AiSettings, readAiSettings, writeAiSettings } from "../../core/vault/aiSettings";
import type { UnlockedVault } from "../../core/vault/vaultSession";

export type AiSettingsAccess = {
  // 読み込みが済むまでは null。
  settings: AiSettings | null;
  // 今の設定から次の設定を作って保存する。今の設定は、先に呼んだ変更が済んだあとのもの（呼んだ順に 1 つずつ流す）。
  // 押した時点の設定から作ると、そのあと（API キーを確かめている間など）に変えた分を、古い値で上書きしてしまう。
  updateSettings: (change: (current: AiSettings) => AiSettings) => Promise<void>;
};

export const AiSettingsContext = createContext<AiSettingsAccess>({ settings: null, updateSettings: () => Promise.resolve() });

export function useAiSettingsOfVault(vault: UnlockedVault): AiSettingsAccess {
  const [settings, setSettings] = useState<AiSettings | null>(null);
  // 書き込みの順番待ちの中で読む、今の設定。描くのを待たずに、直前の変更の結果を持つ。
  const latest = useRef<AiSettings | null>(null);
  const writes = useMemo(() => new SerialQueue(), [vault]);
  useEffect(() => {
    let current = true;
    void readAiSettings(vault.localStore, vault.masterKey).then((stored) => {
      if (current) {
        latest.current = stored;
        setSettings(stored);
      }
    });
    return () => {
      current = false;
      latest.current = null;
    };
  }, [vault]);
  // 画面には、書き終えるのを待たずに出す（チェックや選択がすぐ切り替わるように）。書けなかったら元に戻す。
  const updateSettings = useCallback((change: (current: AiSettings) => AiSettings) => writes.run(async () => {
    const previous = latest.current;
    if (previous === null) {
      return;
    }
    const next = change(previous);
    latest.current = next;
    setSettings(next);
    try {
      await writeAiSettings(vault.localStore, vault.masterKey, next);
    } catch (error) {
      latest.current = previous;
      setSettings(previous);
      throw error;
    }
  }), [vault, writes]);
  return { settings, updateSettings };
}

export function useAiSettings(): AiSettingsAccess {
  return useContext(AiSettingsContext);
}
