// アプリ内の AI のチャットに渡す、メモのツール。中身は MCP と同じ共通のツール（noteTools/）で、チャットだけの決まりを足す。
//   - get_note は、1 回に MAX_NOTE_CHARACTERS 字までを返す。
//   - replace_note_body は、AI に最後に渡した本文の全体と、今の本文が同じときだけ受け付ける。AI が読んだあとで利用者が
//     書いた分を、AI の古い本文で黙って上書きしないため。本文の全体を渡していないメモ（長くて一部だけ読んだメモ）も断る。
// 完全な削除のツールも一覧に入れておく（許すかは設定の許可で決め、許していなければ呼ばれたときに断る）。一覧が会話の途中で
// 変わらないようにするため。

import type { NoteRepository } from "../../core/notes/noteRepository";
import { bodyToMarkdown } from "../markdown/markdownDocument";
import { markdownExportContextOf } from "../markdown/repositoryMarkdownContext";
import { createNoteTools } from "../noteTools/createNoteTools";
import { type NoteTool, NoteToolError, type PreparedNoteToolCall, type ToolArguments } from "../noteTools/noteTool";

// get_note が 1 回に返す本文の長さ。ローカルの LLM の 32K トークン程度の文脈でも、ほかの会話と一緒に収まる大きさ。
export const MAX_NOTE_CHARACTERS = 30_000;

// AI に最後に渡した、メモごとの本文の全体（Markdown）。添えたメモを送ったとき、get_note で全体を返したとき、
// AI の書き込みが済んだときに控える。会話を開いている間だけ持つ。
export class AiKnownNoteBodies {
  readonly #bodies = new Map<string, string>();

  remember(noteId: string, markdown: string): void {
    this.#bodies.set(noteId, markdown);
  }

  has(noteId: string): boolean {
    return this.#bodies.has(noteId);
  }

  matches(noteId: string, markdown: string): boolean {
    return this.#bodies.get(noteId) === markdown;
  }
}

const READ_BEFORE_REPLACING = "read the whole note with get_note before replacing its body (if it is too long to read at once, add to it with append_to_note instead)";
const CHANGED_SINCE_READ = "the note changed after you last read it; read it again with get_note before replacing its body";

type ChatToolRule = (tool: NoteTool) => NoteTool;

// 準備した呼び出しの run のあとに、済んだときだけ afterRun を呼ぶ。
function withAfterRun(prepared: PreparedNoteToolCall, afterRun: (result: unknown) => void, beforeRun: () => void = () => undefined): PreparedNoteToolCall {
  return {
    ...prepared,
    run: async () => {
      beforeRun();
      const result = await prepared.run();
      afterRun(result);
      return result;
    },
  };
}

const noteIdOf = (toolArguments: ToolArguments): string | null => (typeof toolArguments.noteId === "string" ? toolArguments.noteId : null);

export function createChatNoteTools(repository: NoteRepository, knownBodies: AiKnownNoteBodies): NoteTool[] {
  const exportContext = markdownExportContextOf(repository);
  const markdownOfNote = (noteId: string): string | null => {
    const note = repository.note(noteId);
    return note ? bodyToMarkdown(note.body, exportContext) : null;
  };
  const rememberCurrent = (noteId: string) => {
    const markdown = markdownOfNote(noteId);
    if (markdown !== null) {
      knownBodies.remember(noteId, markdown);
    }
  };

  const readInParts: ChatToolRule = (tool) => ({
    ...tool,
    prepare: async (toolArguments) => {
      const requested = typeof toolArguments.maxCharacters === "number" ? toolArguments.maxCharacters : MAX_NOTE_CHARACTERS;
      const prepared = await tool.prepare({ ...toolArguments, maxCharacters: Math.min(requested, MAX_NOTE_CHARACTERS) });
      // 本文の全体を返したときだけ控える（一部だけを返したときの結果には truncated がある）。
      return withAfterRun(prepared, (result) => {
        const { noteId, markdown, truncated } = result as { noteId?: unknown; markdown?: unknown; truncated?: unknown };
        if (typeof noteId === "string" && typeof markdown === "string" && truncated === undefined) {
          knownBodies.remember(noteId, markdown);
        }
      });
    },
  });

  const replaceOnlyWhatWasRead: ChatToolRule = (tool) => ({
    ...tool,
    prepare: async (toolArguments) => {
      const noteId = noteIdOf(toolArguments);
      const current = noteId === null ? null : markdownOfNote(noteId);
      // メモが無いときは、共通のツールの断り方に任せる。
      if (noteId !== null && current !== null) {
        if (!knownBodies.has(noteId)) {
          throw new NoteToolError(READ_BEFORE_REPLACING);
        }
        if (!knownBodies.matches(noteId, current)) {
          throw new NoteToolError(CHANGED_SINCE_READ);
        }
      }
      const prepared = await tool.prepare(toolArguments);
      return withAfterRun(prepared, () => {
        if (noteId !== null) {
          rememberCurrent(noteId);
        }
      });
    },
  });

  // 末尾に足したあとも、AI は本文の全体を知っている（足す前に全体を知っていたときだけ）。
  const appendKeepsWhatWasRead: ChatToolRule = (tool) => ({
    ...tool,
    prepare: async (toolArguments) => {
      const noteId = noteIdOf(toolArguments);
      const prepared = await tool.prepare(toolArguments);
      if (noteId === null) {
        return prepared;
      }
      // 足す直前に確かめる（承認を待つ間に、利用者が書いていることがある）。
      let knewWholeBody = false;
      const checkKnownBody = () => {
        const current = markdownOfNote(noteId);
        knewWholeBody = current !== null && knownBodies.matches(noteId, current);
      };
      return withAfterRun(prepared, () => {
        if (knewWholeBody) {
          rememberCurrent(noteId);
        }
      }, checkKnownBody);
    },
  });

  // AI が書いた本文は、AI が全体を知っている。
  const createKnowsBody: ChatToolRule = (tool) => ({
    ...tool,
    prepare: async (toolArguments) => withAfterRun(await tool.prepare(toolArguments), (result) => {
      const { noteId } = result as { noteId?: unknown };
      if (typeof noteId === "string") {
        rememberCurrent(noteId);
      }
    }),
  });

  const rules: Record<string, ChatToolRule> = {
    get_note: readInParts,
    replace_note_body: replaceOnlyWhatWasRead,
    append_to_note: appendKeepsWhatWasRead,
    create_note: createKnowsBody,
  };
  return createNoteTools(repository, { includesPermanentDelete: true }).map((tool) => rules[tool.name]?.(tool) ?? tool);
}
