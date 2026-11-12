// テンプレートの変数（@date など）を、テンプレートからメモを作る・本文に入れる時点の値に置き換える。
//
// 変数は、本文と題の中の普通の文字として書く。専用のノードにしないのは、データの形の版（format/dataFormat.ts）を
// 上げずに済ませるため（版を上げると、古いアプリは更新するまで同期を止める）。

import * as Y from "yjs";
import { CODE_BLOCK_NODE, CODE_MARK, type TextOperation, textsOutsideCodeBlocks } from "./bodyText";

export const TEMPLATE_VARIABLE_NAMES = ["date", "time", "datetime", "title"] as const;
export type TemplateVariableName = (typeof TEMPLATE_VARIABLE_NAMES)[number];

// 日付と時刻の値。言語と設定に合わせた文字は、呼び出し側（画面）が作って渡す。
export type TemplateTimeValues = Record<Exclude<TemplateVariableName, "title">, string>;
// 値を渡さなかった変数は、置き換えずに文字のまま残す（題の中の @title など）。
export type TemplateVariableValues = Partial<Record<TemplateVariableName, string>>;

// @ の前が英数字なら、メールアドレスの一部（foo@date.example）なので変数にしない。変数名の後ろに英数字が
// 続けば、別の語（@dates）なので変数にしない。日本語の文字は前後に続いてよい（「日付は@dateです」）。
// 日本語には単語の区切りが無いため。
const WORD_CHARACTER = "[A-Za-z0-9_]";
const VARIABLE_PATTERN = new RegExp(`(?<!${WORD_CHARACTER})@(${TEMPLATE_VARIABLE_NAMES.join("|")})(?!${WORD_CHARACTER})`, "g");

// 書式の同じ、続いた文字。1 つの段落の中で、書式（太字など）の変わる所で区切られている。
export type TextRun = { text: string; isCode: boolean };

type VariableMatch = { start: number; end: number; value: string };

// 続いた文字の並び（runs）の中の変数を置き換え、run ごとの新しい文字を返す（runs と同じ順・同じ数）。
// 変数の前後の文字は、runs をつないだ文字で見る。太字の「foo」に続く普通の書式の「@date」も、
// メールアドレスの一部として扱うため。書式の境目をまたぐ変数と、行の中のコードの変数は置き換えない。
export function replaceTemplateVariablesInRuns(runs: TextRun[], values: TemplateVariableValues): string[] {
  const joined = runs.map((run) => run.text).join("");
  const matchesByRun: VariableMatch[][] = runs.map(() => []);
  for (const match of joined.matchAll(VARIABLE_PATTERN)) {
    const value = values[match[1] as TemplateVariableName];
    const run = runContaining(runs, { start: match.index, end: match.index + match[0].length });
    if (value === undefined || run === null || runs[run.index]!.isCode) {
      continue;
    }
    const start = match.index - run.start;
    matchesByRun[run.index]!.push({ start, end: start + match[0].length, value });
  }
  return runs.map((run, index) => withMatchesReplaced(run.text, matchesByRun[index]!));
}

// 題のような、書式の無い 1 行の文字の中の変数を置き換える。
export function replaceTemplateVariablesInText(text: string, values: TemplateVariableValues): string {
  return replaceTemplateVariablesInRuns([{ text, isCode: false }], values)[0]!;
}

// つないだ文字の [start, end) を丸ごと含む run の、並びの中の位置と、つないだ文字の中での始まり。
// 書式の境目をまたいでいれば null。
function runContaining(runs: TextRun[], { start, end }: { start: number; end: number }): { index: number; start: number } | null {
  let runStart = 0;
  for (const [index, run] of runs.entries()) {
    const runEnd = runStart + run.text.length;
    if (start >= runStart && start < runEnd) {
      return end <= runEnd ? { index, start: runStart } : null;
    }
    runStart = runEnd;
  }
  return null;
}

// matches は前から順に並び、重ならない（正規表現の一致の順）。
function withMatchesReplaced(text: string, matches: VariableMatch[]): string {
  let replaced = "";
  let copiedUntil = 0;
  for (const { start, end, value } of matches) {
    replaced += text.slice(copiedUntil, start) + value;
    copiedUntil = end;
  }
  return replaced + text.slice(copiedUntil);
}

// ── ProseMirror の JSON（「/」でテンプレートを入れるとき） ─────────────

// ProseMirror の JSON（Tiptap の JSONContent）のうち、置き換えに要る所。ほかの項目（attrs など）はそのまま写す。
export type ProseMirrorNodeJson = {
  type?: string;
  text?: string;
  marks?: Array<{ type: string }>;
  content?: ProseMirrorNodeJson[];
  [key: string]: unknown;
};

// ノードの並びの中の変数を置き換えた、新しい並びを返す。渡したノードは変えない。
// 置き換えて空になった文字のノードは除く（ProseMirror は空の文字のノードを受け付けない）。
export function replaceTemplateVariablesInNodes(nodes: ProseMirrorNodeJson[], values: TemplateVariableValues): ProseMirrorNodeJson[] {
  const replaced: ProseMirrorNodeJson[] = [];
  let pendingTextNodes: ProseMirrorNodeJson[] = [];
  const flushTextNodes = () => {
    const texts = replaceTemplateVariablesInRuns(pendingTextNodes.map((node) => ({
      text: node.text ?? "", isCode: node.marks?.some((mark) => mark.type === CODE_MARK) ?? false,
    })), values);
    pendingTextNodes.forEach((node, index) => {
      if (texts[index] !== "") {
        replaced.push({ ...node, text: texts[index] });
      }
    });
    pendingTextNodes = [];
  };
  for (const node of nodes) {
    if (node.type === "text") {
      pendingTextNodes.push(node);
      continue;
    }
    // 文字でないノード（メモへのリンクなど）は、続いた文字の区切りになる。
    flushTextNodes();
    const keepsContent = node.content === undefined || node.type === CODE_BLOCK_NODE;
    replaced.push(keepsContent ? node : { ...node, content: replaceTemplateVariablesInNodes(node.content!, values) });
  }
  flushTextNodes();
  return replaced;
}

// ── Yjs の本文（テンプレートから新しいメモを作るとき） ─────────────

// 本文（写したもの）の中の変数を、その場で置き換える。書式（太字など）は保つ。
export function replaceTemplateVariablesInBody(body: Y.XmlFragment, values: TemplateVariableValues): void {
  const replace = () => {
    for (const text of textsOutsideCodeBlocks(body)) {
      replaceTemplateVariablesInYText(text, values);
    }
  };
  if (body.doc) {
    body.doc.transact(replace);
  } else {
    replace();
  }
}

function replaceTemplateVariablesInYText(text: Y.XmlText, values: TemplateVariableValues): void {
  const operations = text.toDelta() as TextOperation[];
  const replacedTexts = replaceTemplateVariablesInRuns(operations.map((operation) => ({
    text: operation.insert, isCode: operation.attributes?.[CODE_MARK] !== undefined,
  })), values);
  // 後ろから置き換えると、まだ置き換えていない前の文字の位置がずれない。
  let operationEnd = text.length;
  for (let index = operations.length - 1; index >= 0; index -= 1) {
    const { insert, attributes } = operations[index]!;
    const operationStart = operationEnd - insert.length;
    if (replacedTexts[index] !== insert) {
      text.delete(operationStart, insert.length);
      // 書式を渡さないと、左隣の文字の書式を継いでしまう。書式の無い文字には空の書式を明示する。
      text.insert(operationStart, replacedTexts[index]!, attributes ?? {});
    }
    operationEnd = operationStart;
  }
}
