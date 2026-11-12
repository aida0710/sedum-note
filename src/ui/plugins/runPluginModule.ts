// プラグインのモジュールを、別のスレッド（ワーカー）で実行する。決めた時間で終わらなければ、ワーカーごと止める。

import { PluginModuleError } from "../../core/plugins/pluginModule";
import type { PluginWorkerRequest, PluginWorkerResponse } from "./pluginWorker";

// コマンド 1 回の実行にかけてよい時間。文字の書き換えは一瞬で済むはずなので、これを超えたら、終わらないものとして止める。
export const PLUGIN_RUN_TIMEOUT_MILLISECONDS = 5_000;

export class PluginTimeoutError extends Error {
  constructor() {
    super("the plugin did not finish in time");
    this.name = "PluginTimeoutError";
  }
}

export function runPluginModule(moduleBytes: Uint8Array, input: string): Promise<string> {
  // 実行のたびに新しいワーカーを作る（前の実行の状態を、次の実行に持ち越させない）。
  const worker = new Worker(new URL("./pluginWorker.ts", import.meta.url), { type: "module" });
  return new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => reject(new PluginTimeoutError()), PLUGIN_RUN_TIMEOUT_MILLISECONDS);
    worker.onmessage = (event: MessageEvent<PluginWorkerResponse>) => {
      clearTimeout(timer);
      if ("output" in event.data) {
        resolve(event.data.output);
      } else {
        reject(new PluginModuleError(event.data.problem));
      }
    };
    worker.onerror = () => {
      clearTimeout(timer);
      reject(new PluginModuleError("trapped"));
    };
    worker.postMessage({ moduleBytes, input } satisfies PluginWorkerRequest);
  }).finally(() => worker.terminate());
}
