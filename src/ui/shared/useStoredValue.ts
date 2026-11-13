// 手元に保存した値（AI の設定、MCP の設定、取り込んだプラグインの一覧）を、画面から読み書きする hook。
// 変更は、先に呼んだ変更が済んだあとの値から作り、呼んだ順に書く（storedValueUpdates.ts）。

import { useEffect, useMemo, useState } from "react";
import { StoredValueUpdates } from "./storedValueUpdates";

type StoredValueSource<Value> = {
  read: () => Promise<Value>;
  write: (value: Value) => Promise<void>;
};

export type StoredValue<Value> = {
  // 読み込みが済むまでは null。
  value: Value | null;
  update: (change: (current: Value) => Value) => Promise<void>;
};

// source が変わったら（ロックを解除し直した、スペースを切り替えた）、読み直す。source は useMemo などで保つ。
export function useStoredValue<Value>(source: StoredValueSource<Value>): StoredValue<Value> {
  const [value, setValue] = useState<Value | null>(null);
  const updates = useMemo(() => new StoredValueUpdates<Value>({ write: source.write, show: setValue }), [source]);
  useEffect(() => {
    let current = true;
    void source.read().then((stored) => current && updates.loaded(stored));
    return () => {
      current = false;
      setValue(null);
    };
  }, [source, updates]);
  return { value, update: (change) => updates.update(change) };
}
