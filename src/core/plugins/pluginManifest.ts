// プラグインの宣言（sedum-note-plugin.json）の形と、その検査。仕様は docs/plugins.md。
//
// プラグインは、宣言（JSON）と、WebAssembly のモジュール 1 つでできている。モジュールは、渡された文字（開いているメモの題・
// 本文・選択した文字のうち、宣言で「読む」としたもの）を受けて、書き換えの指示（宣言で「書く」としたもの）を返す。

export const PLUGIN_MANIFEST_FILE_NAME = "sedum-note-plugin.json";
// 宣言の形の版。読めない版の宣言は、取り込まない。
export const PLUGIN_FORMAT_VERSION = 1;

// プラグインが読めるもの（コマンドを実行したときに、開いているメモから渡す）。
export const PLUGIN_READS = ["note.title", "note.body", "note.selection"] as const;
export type PluginRead = (typeof PLUGIN_READS)[number];

// プラグインが書けるもの（返した指示のうち、アプリが実行するもの）。
export const PLUGIN_WRITES = ["note.selection", "note.body", "note.append", "note.title", "message"] as const;
export type PluginWrite = (typeof PLUGIN_WRITES)[number];

export type PluginCommand = { id: string; title: string; description: string };

export type PluginManifest = {
  formatVersion: typeof PLUGIN_FORMAT_VERSION;
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  // WebAssembly のモジュールの場所（宣言のファイルと同じフォルダからの相対パス）。
  module: string;
  reads: PluginRead[];
  writes: PluginWrite[];
  commands: PluginCommand[];
};

export type PluginManifestProblem =
  | "not_json"
  | "unsupported_format_version"
  | "id_invalid"
  | "text_missing"
  | "module_path_invalid"
  | "permission_unknown"
  | "commands_invalid";

export class PluginManifestError extends Error {
  readonly problem: PluginManifestProblem;

  constructor(problem: PluginManifestProblem) {
    super(`the plugin manifest is not valid: ${problem}`);
    this.name = "PluginManifestError";
    this.problem = problem;
  }
}

// プラグインとコマンドの ID（小文字・数字・ハイフン、2〜64 文字）。
const ID_PATTERN = /^[a-z0-9][a-z0-9-]{1,63}$/;
// モジュールの場所。上のフォルダへ抜けられない、フォルダと名前だけのパス（.wasm で終わる）。
const MODULE_PATH_PATTERN = /^(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+\.wasm$/;
// 画面に出す文字（名前、説明など）の長さの上限。
const MAX_TEXT_LENGTH = 200;
const MAX_COMMAND_COUNT = 50;

function shortText(value: unknown, { required }: { required: boolean }): string {
  if (typeof value !== "string" || value.length > MAX_TEXT_LENGTH || (required && value.trim() === "")) {
    throw new PluginManifestError("text_missing");
  }
  return value.trim();
}

function permissions<Permission extends string>(value: unknown, known: readonly Permission[]): Permission[] {
  if (!Array.isArray(value) || !value.every((item): item is Permission => known.includes(item as Permission))) {
    throw new PluginManifestError("permission_unknown");
  }
  return [...new Set(value)];
}

function commandOf(value: unknown): PluginCommand {
  const candidate = value as Partial<Record<keyof PluginCommand, unknown>> | null;
  if (typeof candidate !== "object" || candidate === null || typeof candidate.id !== "string" || !ID_PATTERN.test(candidate.id)) {
    throw new PluginManifestError("commands_invalid");
  }
  return { id: candidate.id, title: shortText(candidate.title, { required: true }), description: shortText(candidate.description ?? "", { required: false }) };
}

export function parsePluginManifest(text: string): PluginManifest {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new PluginManifestError("not_json");
  }
  const candidate = (typeof parsed === "object" && parsed !== null ? parsed : {}) as Record<string, unknown>;
  if (candidate.formatVersion !== PLUGIN_FORMAT_VERSION) {
    throw new PluginManifestError("unsupported_format_version");
  }
  if (typeof candidate.id !== "string" || !ID_PATTERN.test(candidate.id)) {
    throw new PluginManifestError("id_invalid");
  }
  if (typeof candidate.module !== "string" || !MODULE_PATH_PATTERN.test(candidate.module) || candidate.module.split("/").includes("..")) {
    throw new PluginManifestError("module_path_invalid");
  }
  const commands = Array.isArray(candidate.commands) ? candidate.commands.map(commandOf) : [];
  if (commands.length === 0 || commands.length > MAX_COMMAND_COUNT || new Set(commands.map((command) => command.id)).size !== commands.length) {
    throw new PluginManifestError("commands_invalid");
  }
  return {
    formatVersion: PLUGIN_FORMAT_VERSION,
    id: candidate.id,
    name: shortText(candidate.name, { required: true }),
    version: shortText(candidate.version, { required: true }),
    description: shortText(candidate.description ?? "", { required: false }),
    author: shortText(candidate.author ?? "", { required: false }),
    module: candidate.module,
    reads: permissions(candidate.reads ?? [], PLUGIN_READS),
    writes: permissions(candidate.writes ?? [], PLUGIN_WRITES),
    commands,
  };
}
