// プラグインの WebAssembly のモジュールを確かめる・実行する。仕様は docs/plugins.md の「モジュール」。
//
// モジュールは、外の関数を何も取り込まない（import が 1 つでもあれば断る）。アプリは、何も渡さずに組み立てるので、
// モジュールからは、通信も、保存も、画面も、時計も触れない。できるのは、渡された文字を受けて、文字を返すことだけ。
//
// 文字の受け渡し:
//   sedum_alloc(長さ) -> 位置            モジュールのメモリに、入力を置く場所を取る
//   sedum_run(入力の位置, 入力の長さ) -> i64   上位 32 ビットが出力の位置、下位 32 ビットが出力の長さ
// 入力と出力は、UTF-8 の JSON（pluginRun.ts）。

// モジュールの大きさの上限。取り込むときと、実行の前に確かめる。
export const MAX_PLUGIN_MODULE_BYTES = 2 * 1024 * 1024;
// 入力と出力の大きさの上限（UTF-8 のバイト数）。
export const MAX_PLUGIN_TEXT_BYTES = 4 * 1024 * 1024;

const MEMORY_EXPORT = "memory";
const ALLOC_EXPORT = "sedum_alloc";
const RUN_EXPORT = "sedum_run";
const POINTER_BITS = 32n;
const LENGTH_MASK = 0xffff_ffffn;

export type PluginModuleProblem =
  | "too_large"
  | "not_webassembly"
  | "has_imports"
  | "exports_missing"
  | "input_too_large"
  | "output_out_of_range"
  | "output_too_large"
  | "output_not_text"
  | "trapped";

export class PluginModuleError extends Error {
  readonly problem: PluginModuleProblem;

  constructor(problem: PluginModuleProblem, detail = "") {
    super(`the plugin module cannot be used: ${problem}${detail === "" ? "" : ` (${detail})`}`);
    this.name = "PluginModuleError";
    this.problem = problem;
  }
}

async function compile(moduleBytes: Uint8Array): Promise<WebAssembly.Module> {
  if (moduleBytes.length > MAX_PLUGIN_MODULE_BYTES) {
    throw new PluginModuleError("too_large");
  }
  try {
    return await WebAssembly.compile(moduleBytes as Uint8Array<ArrayBuffer>);
  } catch (error) {
    throw new PluginModuleError("not_webassembly", String(error));
  }
}

function ensureShape(module: WebAssembly.Module): void {
  if (WebAssembly.Module.imports(module).length > 0) {
    throw new PluginModuleError("has_imports");
  }
  const exports = new Map(WebAssembly.Module.exports(module).map((entry) => [entry.name, entry.kind]));
  if (exports.get(MEMORY_EXPORT) !== "memory" || exports.get(ALLOC_EXPORT) !== "function" || exports.get(RUN_EXPORT) !== "function") {
    throw new PluginModuleError("exports_missing");
  }
}

// 取り込む前に、モジュールが決まりに合うかを確かめる（外の関数を取り込まず、決まった名前のものを出している）。実行はしない。
export async function inspectPluginModule(moduleBytes: Uint8Array): Promise<void> {
  ensureShape(await compile(moduleBytes));
}

// モジュールに入力を渡して実行し、出力の文字を返す。終わらないモジュールを止められるよう、別のスレッド（ワーカー）の中から呼ぶ。
export async function executePluginModule(moduleBytes: Uint8Array, input: string): Promise<string> {
  const module = await compile(moduleBytes);
  ensureShape(module);
  const inputBytes = new TextEncoder().encode(input);
  if (inputBytes.length > MAX_PLUGIN_TEXT_BYTES) {
    throw new PluginModuleError("input_too_large");
  }
  try {
    // 何も渡さずに組み立てる。モジュールが使えるのは、自分のメモリと計算だけ。
    const { exports } = await WebAssembly.instantiate(module, {});
    const memory = exports[MEMORY_EXPORT] as WebAssembly.Memory;
    const inputPointer = Number((exports[ALLOC_EXPORT] as (length: number) => number)(inputBytes.length)) >>> 0;
    if (inputPointer + inputBytes.length > memory.buffer.byteLength) {
      throw new PluginModuleError("output_out_of_range", "the input does not fit where sedum_alloc pointed");
    }
    new Uint8Array(memory.buffer, inputPointer, inputBytes.length).set(inputBytes);
    const packed = BigInt.asUintN(64, BigInt((exports[RUN_EXPORT] as (pointer: number, length: number) => bigint)(inputPointer, inputBytes.length)));
    const outputPointer = Number(packed >> POINTER_BITS);
    const outputLength = Number(packed & LENGTH_MASK);
    if (outputLength > MAX_PLUGIN_TEXT_BYTES) {
      throw new PluginModuleError("output_too_large");
    }
    // メモリは、実行の間に広がって、別の入れ物に替わることがある。読む直前に取り直す。
    if (outputPointer + outputLength > memory.buffer.byteLength) {
      throw new PluginModuleError("output_out_of_range");
    }
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(new Uint8Array(memory.buffer, outputPointer, outputLength));
    } catch {
      throw new PluginModuleError("output_not_text");
    }
  } catch (error) {
    throw error instanceof PluginModuleError ? error : new PluginModuleError("trapped", String(error));
  }
}
