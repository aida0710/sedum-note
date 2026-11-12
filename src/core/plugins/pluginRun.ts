// プラグインのコマンドの、入力（アプリが渡すもの）と出力（プラグインが返す指示）の形。仕様は docs/plugins.md の「入力と出力」。
// 宣言で「読む」としたものだけを渡し、「書く」としたものだけを受け取る。

import { PLUGIN_FORMAT_VERSION, type PluginManifest } from "./pluginManifest";

// コマンドを実行したときの、開いているメモ。
// selection は、選択した範囲の文字（書式なし。段落や項目の区切りは改行）。選択していなければ空。
export type PluginNoteContext = { title: string; markdown: string; selection: string };

export type PluginResult = {
  // 選択した文字と置き換える文字（選択していなければ、カーソルの所に入れる）。Markdown としては読まず、改行ごとに段落を分ける。
  replaceSelection?: string;
  // 本文の全部と置き換える Markdown。
  replaceBody?: string;
  // 本文の末尾に足す Markdown。
  append?: string;
  setTitle?: string;
  // 利用者に見せる短い知らせ。
  message?: string;
};

export type PluginResultProblem = "not_json" | "reported_error";

export class PluginResultError extends Error {
  readonly problem: PluginResultProblem;
  // プラグインが返した、失敗の説明（reported_error のとき）。
  readonly detail: string;

  constructor(problem: PluginResultProblem, detail = "") {
    super(`the plugin did not return a usable result: ${problem}`);
    this.name = "PluginResultError";
    this.problem = problem;
    this.detail = detail;
  }
}

// 知らせの長さの上限。長い文字を画面いっぱいに出させない。
const MAX_MESSAGE_LENGTH = 500;

export function pluginInput(manifest: PluginManifest, commandId: string, note: PluginNoteContext, locale: string): string {
  const reads = new Set(manifest.reads);
  return JSON.stringify({
    formatVersion: PLUGIN_FORMAT_VERSION,
    command: commandId,
    locale,
    note: {
      ...(reads.has("note.title") ? { title: note.title } : {}),
      ...(reads.has("note.body") ? { markdown: note.markdown } : {}),
      ...(reads.has("note.selection") ? { selection: note.selection } : {}),
    },
  });
}

// プラグインの出力を読む。宣言で「書く」としていない指示は、捨てる。
export function parsePluginResult(manifest: PluginManifest, output: string): PluginResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(output);
  } catch {
    throw new PluginResultError("not_json");
  }
  const candidate = (typeof parsed === "object" && parsed !== null ? parsed : {}) as Record<string, unknown>;
  if (typeof candidate.error === "string") {
    throw new PluginResultError("reported_error", candidate.error.slice(0, MAX_MESSAGE_LENGTH));
  }
  const writes = new Set(manifest.writes);
  const text = (name: string, permitted: boolean) => (permitted && typeof candidate[name] === "string" ? candidate[name] : undefined);
  const result: PluginResult = {
    replaceSelection: text("replaceSelection", writes.has("note.selection")),
    replaceBody: text("replaceBody", writes.has("note.body")),
    append: text("append", writes.has("note.append")),
    setTitle: text("setTitle", writes.has("note.title")),
    message: text("message", writes.has("message"))?.slice(0, MAX_MESSAGE_LENGTH),
  };
  return Object.fromEntries(Object.entries(result).filter(([, value]) => value !== undefined));
}
