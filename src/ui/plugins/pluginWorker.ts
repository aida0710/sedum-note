// プラグインのモジュールを実行する、別のスレッド（ワーカー）の入口。終わらないモジュールは、呼び出し側がこのワーカーごと止める。
// ワーカーの中のコードは、アプリと一緒に配るこのファイルだけ。プラグインは、ここで組み立てた WebAssembly として動く。

import { executePluginModule, PluginModuleError, type PluginModuleProblem } from "../../core/plugins/pluginModule";

export type PluginWorkerRequest = { moduleBytes: Uint8Array; input: string };
export type PluginWorkerResponse = { output: string } | { problem: PluginModuleProblem };

self.onmessage = (event: MessageEvent<PluginWorkerRequest>) => {
  void executePluginModule(event.data.moduleBytes, event.data.input).then(
    (output) => self.postMessage({ output } satisfies PluginWorkerResponse),
    (error: unknown) => self.postMessage({ problem: error instanceof PluginModuleError ? error.problem : "trapped" } satisfies PluginWorkerResponse),
  );
};
