// メモとノートブックを変えるツール（作る、題やノートブックを変える、本文に足す・差し替える、ゴミ箱、ノートブックの作成・名前の変更・削除、
// 完全な削除）。本文の差し替えは、変わったブロックだけを入れ替える（noteBodyChange.ts）。本文に足す・差し替える前と後に、
// その状態を履歴に残す。後の状態には誰が変えたか（changedBy）を付ける（メモの「…」の履歴から戻せ、利用者の編集と見分けられる）。

import type { VersionChangedBy } from "../../core/local/localStore";
import type { NoteChanges } from "../../core/notes/noteRepository";
import { appendMarkdownToBody } from "../markdown/appendMarkdown";
import { ATTACHMENT_HREF_PREFIX, writeMarkdownToBody } from "../markdown/markdownDocument";
import { applyBodyChange, createBodyChangeProposal, isBodyChangeCurrent } from "./noteBodyChange";
import { ALWAYS_CURRENT, type NoteTool, NoteToolError } from "./noteTool";
import type { NoteToolContext } from "./noteToolContext";
import { ID_SCHEMA, NOTE_ID_PROPERTY, NULLABLE_ID_SCHEMA, objectSchema, optionalBoolean, optionalString, requiredString } from "./toolArguments";

const yesNo = (value: boolean): string => (value ? "yes" : "no");

// 差し替えの案を作ったあとで本文が変わったときの知らせ。AI は読み直して、もう一度呼べる。
const STALE_BODY_MESSAGE = "the note changed after this call was prepared; read it again with get_note and retry";

export function noteChangeTools(context: NoteToolContext, changedBy: VersionChangedBy): NoteTool[] {
  const { repository, noteOf, notebookOf, notebookIdArgument, notebookName, describeNoteAfterChange, exportContext, importContext } = context;
  return [
    {
      name: "create_note",
      title: "Create a note",
      description: "Creates a note from a title and a Markdown body, optionally inside a notebook.",
      category: "edit",
      destructiveHint: false,
      inputSchema: objectSchema({
        title: { type: "string" },
        markdown: { type: "string", description: "The body as Markdown" },
        notebookId: { ...NULLABLE_ID_SCHEMA, description: "The notebook to put the note in. Omit it or pass null to leave the note outside every notebook" },
      }, ["title"]),
      prepare: async (toolArguments) => {
        const title = requiredString(toolArguments, "title");
        const markdown = optionalString(toolArguments, "markdown") ?? "";
        const notebookId = notebookIdArgument(toolArguments) ?? null;
        return {
          preview: { kind: "createNote", title, notebookName: notebookName(notebookId), characterCount: markdown.length },
          isCurrent: ALWAYS_CURRENT,
          run: async () => {
            const note = await repository.createNote({ title, notebookId });
            await writeMarkdownToBody(markdown, note.body, importContext);
            await repository.flush();
            return describeNoteAfterChange(note);
          },
        };
      },
    },
    {
      name: "update_note",
      title: "Change a note's title, notebook, pin or bookmark",
      description: "Changes the fields that are given and leaves the others as they are. Does not touch the body.",
      category: "edit",
      destructiveHint: false,
      inputSchema: objectSchema({
        ...NOTE_ID_PROPERTY,
        title: { type: "string" },
        notebookId: { ...NULLABLE_ID_SCHEMA, description: "The notebook to move the note to (a note is in one notebook at most). null moves it out of every notebook" },
        pinned: { type: "boolean" },
        bookmarked: { type: "boolean" },
      }, ["noteId"]),
      prepare: async (toolArguments) => {
        const note = noteOf(toolArguments);
        const changes: NoteChanges = {};
        const shown: Array<{ field: "title" | "notebook" | "pinned" | "bookmarked"; before: string; after: string }> = [];
        const title = optionalString(toolArguments, "title");
        const notebookId = notebookIdArgument(toolArguments);
        const pinned = optionalBoolean(toolArguments, "pinned");
        const bookmarked = optionalBoolean(toolArguments, "bookmarked");
        if (title !== undefined) {
          changes.title = title;
          shown.push({ field: "title", before: note.content.title, after: title });
        }
        if (notebookId !== undefined) {
          changes.notebookId = notebookId;
          shown.push({ field: "notebook", before: notebookName(note.content.notebookId), after: notebookName(notebookId) });
        }
        if (pinned !== undefined) {
          changes.pinned = pinned;
          shown.push({ field: "pinned", before: yesNo(note.content.pinned), after: yesNo(pinned) });
        }
        if (bookmarked !== undefined) {
          changes.bookmarked = bookmarked;
          shown.push({ field: "bookmarked", before: yesNo(note.content.bookmarked), after: yesNo(bookmarked) });
        }
        return {
          preview: { kind: "updateNote", noteId: note.id, title: note.content.title, changes: shown },
          isCurrent: ALWAYS_CURRENT,
          run: async () => {
            await repository.updateNote(note.id, changes);
            await repository.flush();
            return describeNoteAfterChange(note);
          },
        };
      },
    },
    {
      name: "append_to_note",
      title: "Append to a note",
      description: "Adds Markdown to the end of a note's body without changing what is already there. Prefer this over replace_note_body when only adding.",
      category: "edit",
      destructiveHint: false,
      inputSchema: objectSchema({ ...NOTE_ID_PROPERTY, markdown: { type: "string" } }, ["noteId", "markdown"]),
      prepare: async (toolArguments) => {
        const note = noteOf(toolArguments);
        const markdown = requiredString(toolArguments, "markdown");
        return {
          preview: { kind: "appendToNote", noteId: note.id, title: note.content.title, characterCount: markdown.length },
          isCurrent: ALWAYS_CURRENT,
          run: async () => {
            await repository.captureVersionBeforeChange(note.id);
            await appendMarkdownToBody(markdown, note.body, importContext);
            await repository.captureVersionAfterChange(note.id, changedBy);
            return describeNoteAfterChange(note);
          },
        };
      },
    },
    {
      name: "replace_note_body",
      title: "Replace a note's body",
      description: `Replaces the whole body with the given Markdown, as returned by get_note with your changes made. Only the blocks that differ are rewritten, so unchanged blocks keep formatting that Markdown cannot show (text colors, merged table cells). The previous body is kept in the note's history on this device. Attachments stay only if their ${ATTACHMENT_HREF_PREFIX}<id> links are kept. A " ^id" mark at the end of a line is the ID that links from other notes point to; keep it on its block, or those links lose their target.`,
      category: "edit",
      destructiveHint: true,
      inputSchema: objectSchema({ ...NOTE_ID_PROPERTY, markdown: { type: "string" } }, ["noteId", "markdown"]),
      prepare: async (toolArguments) => {
        const note = noteOf(toolArguments);
        const markdown = requiredString(toolArguments, "markdown");
        const bodyChange = await createBodyChangeProposal({ body: note.body, markdown, exportContext, importContext });
        const isCurrent = () => repository.note(note.id)?.body === note.body && isBodyChangeCurrent(note.body, bodyChange, exportContext);
        const ensureCurrent = () => {
          if (!isCurrent()) {
            throw new NoteToolError(STALE_BODY_MESSAGE);
          }
        };
        return {
          preview: { kind: "replaceNoteBody", noteId: note.id, title: note.content.title },
          bodyChange,
          isCurrent,
          run: async () => {
            if (bodyChange.hunks.length === 0) {
              return describeNoteAfterChange(note);
            }
            // 履歴に残すのを待つ間に、本文が変わることがある（エディタで書いている、ほかのデバイスから届く）。前と後で確かめる。
            ensureCurrent();
            await repository.captureVersionBeforeChange(note.id);
            ensureCurrent();
            applyBodyChange(note.body, bodyChange, exportContext);
            await repository.captureVersionAfterChange(note.id, changedBy);
            return describeNoteAfterChange(note);
          },
        };
      },
    },
    {
      name: "move_note_to_trash",
      title: "Move a note to the trash",
      description: "Moves a note to the trash. It can be brought back with restore_note_from_trash.",
      category: "trash",
      destructiveHint: false,
      inputSchema: objectSchema(NOTE_ID_PROPERTY, ["noteId"]),
      prepare: async (toolArguments) => {
        const note = noteOf(toolArguments);
        return {
          preview: { kind: "moveNoteToTrash", noteId: note.id, title: note.content.title },
          isCurrent: ALWAYS_CURRENT,
          run: async () => {
            await repository.moveNoteToTrash(note.id);
            await repository.flush();
            return describeNoteAfterChange(note);
          },
        };
      },
    },
    {
      name: "restore_note_from_trash",
      title: "Restore a note from the trash",
      description: "Brings a note back from the trash.",
      category: "edit",
      destructiveHint: false,
      inputSchema: objectSchema(NOTE_ID_PROPERTY, ["noteId"]),
      prepare: async (toolArguments) => {
        const note = noteOf(toolArguments);
        return {
          preview: { kind: "restoreNoteFromTrash", noteId: note.id, title: note.content.title },
          isCurrent: ALWAYS_CURRENT,
          run: async () => {
            await repository.restoreNoteFromTrash(note.id);
            await repository.flush();
            return describeNoteAfterChange(note);
          },
        };
      },
    },
    {
      name: "create_notebook",
      title: "Create a notebook",
      description: "Creates a notebook, optionally inside another notebook.",
      category: "edit",
      destructiveHint: false,
      inputSchema: objectSchema({ name: { type: "string" }, parentNotebookId: { ...ID_SCHEMA, description: "The notebook to create it in" } }, ["name"]),
      prepare: async (toolArguments) => {
        const name = requiredString(toolArguments, "name");
        const parent = toolArguments.parentNotebookId === undefined ? null : notebookOf(toolArguments, "parentNotebookId");
        return {
          preview: { kind: "createNotebook", name, parentName: parent?.content.name ?? null },
          isCurrent: ALWAYS_CURRENT,
          run: async () => {
            const notebook = await repository.createNotebook(name, parent?.id ?? null);
            return { notebookId: notebook.id, name: notebook.content.name, parentNotebookId: notebook.content.parentId };
          },
        };
      },
    },
    {
      name: "rename_notebook",
      title: "Rename a notebook",
      description: "Changes the name of a notebook.",
      category: "edit",
      destructiveHint: false,
      inputSchema: objectSchema({ notebookId: ID_SCHEMA, name: { type: "string" } }, ["notebookId", "name"]),
      prepare: async (toolArguments) => {
        const notebook = notebookOf(toolArguments);
        const name = requiredString(toolArguments, "name");
        return {
          preview: { kind: "renameNotebook", notebookId: notebook.id, before: notebook.content.name, after: name },
          isCurrent: ALWAYS_CURRENT,
          run: async () => {
            await repository.updateNotebook(notebook.id, { name });
            await repository.flush();
            return { notebookId: notebook.id, name };
          },
        };
      },
    },
    {
      name: "delete_notebook",
      title: "Delete a notebook",
      description: "Deletes a notebook. Its notes and the notebooks inside it are not deleted; they move up one level (notes in a top-level notebook end up outside every notebook).",
      category: "trash",
      destructiveHint: true,
      inputSchema: objectSchema({ notebookId: ID_SCHEMA }, ["notebookId"]),
      prepare: async (toolArguments) => {
        const notebook = notebookOf(toolArguments);
        const noteCount = repository.notes().filter((note) => note.content.notebookId === notebook.id).length;
        const childCount = repository.notebooks().filter((candidate) => candidate.content.parentId === notebook.id).length;
        return {
          preview: { kind: "deleteNotebook", notebookId: notebook.id, name: notebook.content.name, noteCount, childCount },
          isCurrent: ALWAYS_CURRENT,
          run: async () => {
            await repository.removeNotebook(notebook.id);
            return { deletedNotebookId: notebook.id };
          },
        };
      },
    },
  ];
}

// 完全な削除（元に戻せない）。MCP では設定で許したときだけ、チャットでは許可の設定に従って出す。
export function permanentDeleteTool(context: NoteToolContext): NoteTool {
  const { repository, noteOf } = context;
  return {
    name: "delete_note_permanently",
    title: "Delete a note permanently",
    description: "Deletes a note for good, on every device. This cannot be undone and the note's history is deleted too. Only notes already in the trash can be deleted.",
    category: "permanentDelete",
    destructiveHint: true,
    inputSchema: objectSchema(NOTE_ID_PROPERTY, ["noteId"]),
    prepare: async (toolArguments) => {
      const note = noteOf(toolArguments);
      if (note.content.trashedAt === null) {
        throw new NoteToolError("move the note to the trash first");
      }
      return {
        preview: { kind: "deleteNotePermanently", noteId: note.id, title: note.content.title },
        isCurrent: ALWAYS_CURRENT,
        run: async () => {
          await repository.removeNotePermanently(note.id);
          return { deletedNoteId: note.id };
        },
      };
    },
  };
}
