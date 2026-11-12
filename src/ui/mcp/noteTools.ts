// MCP のクライアント（AI）に見せる、メモの操作のツール。ロックを解除したリポジトリの上で動く。
//
// 本文は Markdown でやり取りする。添付は中身を渡さず、ID を指すリンク（sedum-note://attachment/<id>）で表す。
// 読んだ Markdown のリンクをそのまま書き戻せば、同じ添付が本文に戻る。
// 本文を丸ごと置き換える前には、履歴に今の状態を残す（メモの「…」の履歴から戻せる）。

import { McpToolError, type McpTool } from "../../core/mcp/mcpServer";
import { buildNotebookTree, countTags, notebookNameLookup, selectNotes, summarizeNote, type NoteView } from "../../core/notes/noteQueries";
import type { LiveNote } from "../../core/notes/noteRecords";
import type { NoteChanges, NoteRepository } from "../../core/notes/noteRepository";
import { appendMarkdownToBody } from "../markdown/appendMarkdown";
import { ATTACHMENT_HREF_PREFIX, bodyToMarkdown, writeMarkdownToBody } from "../markdown/markdownDocument";
import { markdownExportContextOf, markdownImportContextOf } from "../markdown/repositoryMarkdownContext";

// 検索の結果に付ける本文の抜き書きの長さ（文字数）。
const SNIPPET_LENGTH = 200;
const DEFAULT_SEARCH_LIMIT = 30;
const MAX_SEARCH_LIMIT = 200;

type ToolArguments = Record<string, unknown>;

export type NoteToolOptions = {
  // 完全な削除（元に戻せない）のツールを出すか。
  allowPermanentDelete: boolean;
};

const ID_SCHEMA = { type: "string", description: "32 hexadecimal characters" };
const NOTE_ID_PROPERTY = { noteId: { ...ID_SCHEMA, description: "The id of the note (32 hexadecimal characters)" } };

function objectSchema(properties: Record<string, unknown>, required: string[] = []): Record<string, unknown> {
  return { type: "object", properties, required, additionalProperties: false };
}

function requiredString(toolArguments: ToolArguments, name: string): string {
  const value = toolArguments[name];
  if (typeof value !== "string") {
    throw new McpToolError(`${name} must be a string`);
  }
  return value;
}

function optionalString(toolArguments: ToolArguments, name: string): string | undefined {
  return toolArguments[name] === undefined ? undefined : requiredString(toolArguments, name);
}

function optionalBoolean(toolArguments: ToolArguments, name: string): boolean | undefined {
  const value = toolArguments[name];
  if (value !== undefined && typeof value !== "boolean") {
    throw new McpToolError(`${name} must be true or false`);
  }
  return value;
}

function optionalStringList(toolArguments: ToolArguments, name: string): string[] | undefined {
  const value = toolArguments[name];
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new McpToolError(`${name} must be a list of strings`);
  }
  return value as string[];
}

export function createNoteTools(repository: NoteRepository, options: NoteToolOptions): McpTool[] {
  const noteOf = (toolArguments: ToolArguments): LiveNote => {
    const note = repository.note(requiredString(toolArguments, "noteId"));
    if (!note) {
      throw new McpToolError("there is no note with that id");
    }
    return note;
  };
  const existingNotebookIds = (toolArguments: ToolArguments): string[] | undefined => {
    const notebookIds = optionalStringList(toolArguments, "notebookIds");
    const known = new Set(repository.notebooks().map((notebook) => notebook.id));
    const unknown = notebookIds?.find((notebookId) => !known.has(notebookId));
    if (unknown !== undefined) {
      throw new McpToolError(`there is no notebook with the id ${unknown}`);
    }
    return notebookIds;
  };
  const notebookOf = (toolArguments: ToolArguments, name = "notebookId") => {
    const notebook = repository.notebooks().find((candidate) => candidate.id === requiredString(toolArguments, name));
    if (!notebook) {
      throw new McpToolError("there is no notebook with that id");
    }
    return notebook;
  };

  const importContext = markdownImportContextOf(repository);
  const markdownOf = (note: LiveNote) => bodyToMarkdown(note.body, markdownExportContextOf(repository));
  const describeNote = (note: LiveNote) => ({
    noteId: note.id,
    title: note.content.title,
    notebookIds: note.content.notebookIds,
    pinned: note.content.pinned,
    bookmarked: note.content.bookmarked,
    inTrash: note.content.trashedAt !== null,
    isTemplate: note.content.isTemplate,
    createdAt: note.content.createdAt,
    updatedAt: note.updatedAt,
  });

  const tools: McpTool[] = [
    {
      name: "search_notes",
      title: "Search notes",
      description: "Lists notes, newest first. Filters by words in the title or body, by notebook, by tag, or lists the trash. Returns ids, titles and a short excerpt; use get_note for the full text.",
      readOnly: true,
      destructive: false,
      inputSchema: objectSchema({
        query: { type: "string", description: "Words that must all appear in the title or body. Omit to list everything." },
        notebookId: { ...ID_SCHEMA, description: "Only notes in this notebook" },
        tag: { type: "string", description: "Only notes with this #tag (without the #)" },
        inTrash: { type: "boolean", description: "List the notes in the trash instead" },
        limit: { type: "integer", minimum: 1, maximum: MAX_SEARCH_LIMIT, description: `How many notes to return (default ${DEFAULT_SEARCH_LIMIT})` },
      }),
      run: async (toolArguments) => {
        const notebookId = optionalString(toolArguments, "notebookId");
        const tag = optionalString(toolArguments, "tag");
        const view: NoteView = optionalBoolean(toolArguments, "inTrash") ? { kind: "trash" }
          : notebookId !== undefined ? { kind: "notebook", notebookId }
          : tag !== undefined ? { kind: "tag", tag }
          : { kind: "all" };
        const limit = Math.min(MAX_SEARCH_LIMIT, Math.max(1, Number(toolArguments.limit ?? DEFAULT_SEARCH_LIMIT) || DEFAULT_SEARCH_LIMIT));
        const found = selectNotes(repository.notes().map(summarizeNote), {
          view, searchText: optionalString(toolArguments, "query") ?? "", notebookNameOf: notebookNameLookup(repository.notebooks()),
        });
        return {
          totalCount: found.length,
          notes: found.slice(0, limit).map((summary) => ({
            ...describeNote(summary.note), tags: summary.tags, excerpt: summary.plainText.slice(0, SNIPPET_LENGTH),
          })),
        };
      },
    },
    {
      name: "get_note",
      title: "Read a note",
      description: `Returns a note with its body as Markdown. Attachments appear as links to ${ATTACHMENT_HREF_PREFIX}<id>; keep those links unchanged when writing the body back so the attachments stay in the note.`,
      readOnly: true,
      destructive: false,
      inputSchema: objectSchema(NOTE_ID_PROPERTY, ["noteId"]),
      run: async (toolArguments) => {
        const note = noteOf(toolArguments);
        return { ...describeNote(note), markdown: markdownOf(note), attachments: note.content.attachments };
      },
    },
    {
      name: "create_note",
      title: "Create a note",
      description: "Creates a note from a title and a Markdown body, optionally inside notebooks.",
      readOnly: false,
      destructive: false,
      inputSchema: objectSchema({
        title: { type: "string" },
        markdown: { type: "string", description: "The body as Markdown" },
        notebookIds: { type: "array", items: ID_SCHEMA, description: "Notebooks to put the note in" },
      }, ["title"]),
      run: async (toolArguments) => {
        const note = await repository.createNote({ title: requiredString(toolArguments, "title"), notebookIds: existingNotebookIds(toolArguments) ?? [] });
        await writeMarkdownToBody(optionalString(toolArguments, "markdown") ?? "", note.body, importContext);
        await repository.flush();
        return describeNote(repository.note(note.id) ?? note);
      },
    },
    {
      name: "update_note",
      title: "Change a note's title, notebooks, pin or bookmark",
      description: "Changes the fields that are given and leaves the others as they are. Does not touch the body.",
      readOnly: false,
      destructive: false,
      inputSchema: objectSchema({
        ...NOTE_ID_PROPERTY,
        title: { type: "string" },
        notebookIds: { type: "array", items: ID_SCHEMA, description: "The complete list of notebooks the note should be in" },
        pinned: { type: "boolean" },
        bookmarked: { type: "boolean" },
      }, ["noteId"]),
      run: async (toolArguments) => {
        const note = noteOf(toolArguments);
        const changes: NoteChanges = {};
        const title = optionalString(toolArguments, "title");
        const notebookIds = existingNotebookIds(toolArguments);
        const pinned = optionalBoolean(toolArguments, "pinned");
        const bookmarked = optionalBoolean(toolArguments, "bookmarked");
        if (title !== undefined) {
          changes.title = title;
        }
        if (notebookIds !== undefined) {
          changes.notebookIds = notebookIds;
        }
        if (pinned !== undefined) {
          changes.pinned = pinned;
        }
        if (bookmarked !== undefined) {
          changes.bookmarked = bookmarked;
        }
        await repository.updateNote(note.id, changes);
        await repository.flush();
        return describeNote(repository.note(note.id) ?? note);
      },
    },
    {
      name: "append_to_note",
      title: "Append to a note",
      description: "Adds Markdown to the end of a note's body without changing what is already there. Prefer this over replace_note_body when only adding.",
      readOnly: false,
      destructive: false,
      inputSchema: objectSchema({ ...NOTE_ID_PROPERTY, markdown: { type: "string" } }, ["noteId", "markdown"]),
      run: async (toolArguments) => {
        const note = noteOf(toolArguments);
        await appendMarkdownToBody(requiredString(toolArguments, "markdown"), note.body, importContext);
        await repository.flush();
        return describeNote(repository.note(note.id) ?? note);
      },
    },
    {
      name: "replace_note_body",
      title: "Replace a note's body",
      description: `Replaces the whole body with the given Markdown. The previous body is kept in the note's history on this device. Attachments stay only if their ${ATTACHMENT_HREF_PREFIX}<id> links are kept. A " ^id" mark at the end of a line is the ID that links from other notes point to; keep it on its block, or those links lose their target.`,
      readOnly: false,
      destructive: true,
      inputSchema: objectSchema({ ...NOTE_ID_PROPERTY, markdown: { type: "string" } }, ["noteId", "markdown"]),
      run: async (toolArguments) => {
        const note = noteOf(toolArguments);
        const markdown = requiredString(toolArguments, "markdown");
        await repository.captureVersionBeforeReplace(note.id);
        await writeMarkdownToBody(markdown, note.body, importContext);
        await repository.flush();
        return describeNote(repository.note(note.id) ?? note);
      },
    },
    {
      name: "move_note_to_trash",
      title: "Move a note to the trash",
      description: "Moves a note to the trash. It can be brought back with restore_note_from_trash.",
      readOnly: false,
      destructive: false,
      inputSchema: objectSchema(NOTE_ID_PROPERTY, ["noteId"]),
      run: async (toolArguments) => {
        const note = noteOf(toolArguments);
        await repository.moveNoteToTrash(note.id);
        await repository.flush();
        return describeNote(repository.note(note.id) ?? note);
      },
    },
    {
      name: "restore_note_from_trash",
      title: "Restore a note from the trash",
      description: "Brings a note back from the trash.",
      readOnly: false,
      destructive: false,
      inputSchema: objectSchema(NOTE_ID_PROPERTY, ["noteId"]),
      run: async (toolArguments) => {
        const note = noteOf(toolArguments);
        await repository.restoreNoteFromTrash(note.id);
        await repository.flush();
        return describeNote(repository.note(note.id) ?? note);
      },
    },
    {
      name: "list_notebooks",
      title: "List notebooks",
      description: "Returns the notebooks as a tree, with how many notes each one holds.",
      readOnly: true,
      destructive: false,
      inputSchema: objectSchema({}),
      run: async () => {
        const notes = repository.notes().filter((note) => note.content.trashedAt === null);
        type DescribedNotebook = { notebookId: string; name: string; noteCount: number; children: DescribedNotebook[] };
        const describe = (nodes: ReturnType<typeof buildNotebookTree>): DescribedNotebook[] => nodes.map((node) => ({
          notebookId: node.notebook.id,
          name: node.notebook.content.name,
          noteCount: notes.filter((note) => note.content.notebookIds.includes(node.notebook.id)).length,
          children: describe(node.children),
        }));
        return { notebooks: describe(buildNotebookTree(repository.notebooks())) };
      },
    },
    {
      name: "create_notebook",
      title: "Create a notebook",
      description: "Creates a notebook, optionally inside another notebook.",
      readOnly: false,
      destructive: false,
      inputSchema: objectSchema({ name: { type: "string" }, parentNotebookId: { ...ID_SCHEMA, description: "The notebook to create it in" } }, ["name"]),
      run: async (toolArguments) => {
        const parentId = toolArguments.parentNotebookId === undefined ? null : notebookOf(toolArguments, "parentNotebookId").id;
        const notebook = await repository.createNotebook(requiredString(toolArguments, "name"), parentId);
        return { notebookId: notebook.id, name: notebook.content.name, parentNotebookId: notebook.content.parentId };
      },
    },
    {
      name: "rename_notebook",
      title: "Rename a notebook",
      description: "Changes the name of a notebook.",
      readOnly: false,
      destructive: false,
      inputSchema: objectSchema({ notebookId: ID_SCHEMA, name: { type: "string" } }, ["notebookId", "name"]),
      run: async (toolArguments) => {
        const notebook = notebookOf(toolArguments);
        await repository.updateNotebook(notebook.id, { name: requiredString(toolArguments, "name") });
        await repository.flush();
        return { notebookId: notebook.id, name: requiredString(toolArguments, "name") };
      },
    },
    {
      name: "delete_notebook",
      title: "Delete a notebook",
      description: "Deletes a notebook. Its notes are not deleted; they are only removed from the notebook. Notebooks inside it move up one level.",
      readOnly: false,
      destructive: true,
      inputSchema: objectSchema({ notebookId: ID_SCHEMA }, ["notebookId"]),
      run: async (toolArguments) => {
        const notebook = notebookOf(toolArguments);
        await repository.removeNotebook(notebook.id);
        return { deletedNotebookId: notebook.id };
      },
    },
    {
      name: "list_tags",
      title: "List tags",
      description: "Returns the #tags used in note bodies, with how many notes use each.",
      readOnly: true,
      destructive: false,
      inputSchema: objectSchema({}),
      run: async () => ({ tags: countTags(repository.notes().map(summarizeNote)) }),
    },
  ];
  if (options.allowPermanentDelete) {
    tools.push({
      name: "delete_note_permanently",
      title: "Delete a note permanently",
      description: "Deletes a note for good, on every device. This cannot be undone and the note's history is deleted too. Only notes already in the trash can be deleted.",
      readOnly: false,
      destructive: true,
      inputSchema: objectSchema(NOTE_ID_PROPERTY, ["noteId"]),
      run: async (toolArguments) => {
        const note = noteOf(toolArguments);
        if (note.content.trashedAt === null) {
          throw new McpToolError("move the note to the trash first");
        }
        await repository.removeNotePermanently(note.id);
        return { deletedNoteId: note.id };
      },
    });
  }
  return tools;
}

// クライアント（AI）に渡す、このサーバーの使い方。
export const NOTE_SERVER_INSTRUCTIONS =
  "Sedum Note: the user's end-to-end encrypted notes, available while the app is unlocked. " +
  "Find notes with search_notes, read one with get_note (the body is Markdown). " +
  "To add text use append_to_note; replace_note_body rewrites the whole body. " +
  "Notes go to the trash with move_note_to_trash and can be restored.";
