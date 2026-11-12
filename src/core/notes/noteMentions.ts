// リンクしていない言及: あるメモの題が、ほかのメモの本文にリンクではなく文字のまま書かれている所。
// バックリンクの欄の下に並べ、押すとその文字をリンクに置き換える。

import * as Y from "yjs";
import { CODE_MARK, NOTE_LINK_NODE, type TextOperation, textsOutsideCodeBlocks } from "./bodyText";
import type { NoteSummary } from "./noteQueries";
import type { LiveNote } from "./noteRecords";
import { excerptAt } from "./textExcerpt";

// これより短い題は、ほかの言葉の一部に当たりやすいので探さない（1 文字の題など）。
const MIN_MENTIONED_TITLE_LENGTH = 2;

export type UnlinkedMention = { note: LiveNote; excerpt: string };

// 題を探す正規表現。大文字と小文字は区別しない。英数字で始まる・終わる題は、ほかの英単語の一部には当てない
// （「Go」を「Google」に当てない）。日本語には単語の区切りが無いので、区切りを見ない。
function mentionPattern(title: string): RegExp | null {
  const trimmed = title.trim();
  if ([...trimmed].length < MIN_MENTIONED_TITLE_LENGTH) {
    return null;
  }
  const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const before = /^\w/.test(trimmed) ? "(?<!\\w)" : "";
  const after = /\w$/.test(trimmed) ? "(?!\\w)" : "";
  return new RegExp(`${before}${escaped}${after}`, "giu");
}

// target の題に言及していて、まだ target へリンクしていないメモ。新しいものから並べる。
export function findUnlinkedMentions(summaries: NoteSummary[], target: LiveNote): UnlinkedMention[] {
  const pattern = mentionPattern(target.content.title);
  if (pattern === null) {
    return [];
  }
  return summaries
    .filter(({ note, linkedNoteIds }) => note.id !== target.id && note.content.trashedAt === null && !linkedNoteIds.includes(target.id))
    .flatMap(({ note, plainText }) => {
      pattern.lastIndex = 0;
      const match = pattern.exec(plainText);
      return match === null ? [] : [{ note, excerpt: excerptAt(plainText, { index: match.index, length: match[0].length }) }];
    })
    .sort((left, right) => right.note.updatedAt.localeCompare(left.note.updatedAt));
}

type MentionLink = { title: string; noteId: string };

// 本文の中で最初に見つかった題の文字を、noteId へのリンクに置き換える。置き換えられる所が無ければ false。
// 題が太字の途中で切れているなど、1 つの文字のまとまり（Y.XmlText）に収まっていない所は置き換えない。
export function linkFirstMention(body: Y.XmlFragment, { title, noteId }: MentionLink): boolean {
  const pattern = mentionPattern(title);
  if (pattern === null) {
    return false;
  }
  for (const text of textsOutsideCodeBlocks(body)) {
    const operations = text.toDelta() as TextOperation[];
    const match = firstMatchOutsideCode(operations, pattern);
    if (match !== null) {
      const replace = () => replaceWithLink(text, { operations, match, noteId });
      if (body.doc) {
        body.doc.transact(replace);
      } else {
        replace();
      }
      return true;
    }
  }
  return false;
}

// コードの中の文字はリンクに置き換えない。題と同じでも、別の意味で書いていることが多い。
function firstMatchOutsideCode(operations: TextOperation[], pattern: RegExp): { index: number; length: number } | null {
  const fullText = operations.map((operation) => operation.insert).join("");
  pattern.lastIndex = 0;
  for (const match of fullText.matchAll(pattern)) {
    const range = { index: match.index, length: match[0].length };
    if (!overlapsCodeMark(operations, range)) {
      return range;
    }
  }
  return null;
}

function overlapsCodeMark(operations: TextOperation[], { index, length }: { index: number; length: number }): boolean {
  let start = 0;
  for (const operation of operations) {
    const end = start + operation.insert.length;
    if (start < index + length && index < end && operation.attributes?.[CODE_MARK] !== undefined) {
      return true;
    }
    start = end;
  }
  return false;
}

// 書式（太字など）を保ったまま、offset から後ろの文字を切り出す。
function operationsFrom(operations: TextOperation[], offset: number): TextOperation[] {
  let start = 0;
  const rest: TextOperation[] = [];
  for (const operation of operations) {
    const end = start + operation.insert.length;
    if (end > offset) {
      rest.push({ ...operation, insert: operation.insert.slice(Math.max(0, offset - start)) });
    }
    start = end;
  }
  return rest;
}

type LinkReplacement = { operations: TextOperation[]; match: { index: number; length: number }; noteId: string };

// 「前の文字・リンク・後ろの文字」の 3 つに分ける。リンクは段落の中の別の要素なので、文字のまとまりを 2 つに切る。
// 言及が文字のまとまりの頭にあるときは、前の文字が空になるので、まとまりごとリンクと後ろの文字に置き換える
// （空の文字のまとまりを残さない）。
function replaceWithLink(text: Y.XmlText, { operations, match, noteId }: LinkReplacement): void {
  const parent = text.parent as Y.XmlElement;
  const fullLength = operations.reduce((length, operation) => length + operation.insert.length, 0);
  const rest = operationsFrom(operations, match.index + match.length);
  const link = new Y.XmlElement(NOTE_LINK_NODE);
  link.setAttribute("noteId", noteId);
  const replacement: Array<Y.XmlElement | Y.XmlText> = [link];
  if (rest.length > 0) {
    const restText = new Y.XmlText();
    restText.applyDelta(rest);
    replacement.push(restText);
  }
  const position = parent.toArray().indexOf(text);
  if (match.index === 0) {
    parent.delete(position, 1);
    parent.insert(position, replacement);
    return;
  }
  text.delete(match.index, fullLength - match.index);
  parent.insert(position + 1, replacement);
}
