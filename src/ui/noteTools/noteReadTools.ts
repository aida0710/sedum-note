// 読むだけのツール（メモを探す・読む、ノートブックとタグの一覧）。

import { buildNotebookTree, countTags, notebookNameLookup, selectNotes, summarizeNote, type NoteView } from "../../core/notes/noteQueries";
import { ATTACHMENT_HREF_PREFIX } from "../markdown/markdownDocument";
import { ALWAYS_CURRENT, type NoteTool } from "./noteTool";
import type { NoteToolContext } from "./noteToolContext";
import { boundedInteger, ID_SCHEMA, NOTE_ID_PROPERTY, objectSchema, optionalBoolean, optionalString } from "./toolArguments";

// 検索の結果に付ける本文の抜き書きの長さ（文字数）。
const SNIPPET_LENGTH = 200;
const SEARCH_LIMIT = { minimum: 1, maximum: 200, fallback: 30 };

export function noteReadTools(context: NoteToolContext): NoteTool[] {
  const { repository, noteOf, describeNote, markdownOf, notebookName } = context;
  return [
    {
      name: "search_notes",
      title: "Search notes",
      description: "Lists notes, newest first. Filters by words in the title or body, by notebook, by tag, or lists the trash. Returns ids, titles and a short excerpt; use get_note for the full text.",
      category: "read",
      destructiveHint: false,
      inputSchema: objectSchema({
        query: { type: "string", description: "Words that must all appear in the title or body. Omit to list everything." },
        notebookId: { ...ID_SCHEMA, description: "Only notes in this notebook" },
        tag: { type: "string", description: "Only notes with this #tag (without the #)" },
        inTrash: { type: "boolean", description: "List the notes in the trash instead" },
        limit: { type: "integer", description: `How many notes to return, ${SEARCH_LIMIT.minimum} to ${SEARCH_LIMIT.maximum} (default ${SEARCH_LIMIT.fallback})` },
      }),
      prepare: async (toolArguments) => {
        const query = optionalString(toolArguments, "query") ?? "";
        const notebookId = optionalString(toolArguments, "notebookId");
        const tag = optionalString(toolArguments, "tag");
        const inTrash = optionalBoolean(toolArguments, "inTrash") ?? false;
        const limit = boundedInteger(toolArguments, "limit", SEARCH_LIMIT);
        const view: NoteView = inTrash ? { kind: "trash" }
          : notebookId !== undefined ? { kind: "notebook", notebookId }
          : tag !== undefined ? { kind: "tag", tag }
          : { kind: "all" };
        return {
          preview: { kind: "searchNotes", query: query === "" ? null : query, notebookName: notebookId === undefined ? null : notebookName(notebookId), tag: tag ?? null, inTrash },
          isCurrent: ALWAYS_CURRENT,
          run: async () => {
            const found = selectNotes(repository.notes().map(summarizeNote), { view, searchText: query, notebookNameOf: notebookNameLookup(repository.notebooks()) });
            return {
              totalCount: found.length,
              notes: found.slice(0, limit).map((summary) => ({ ...describeNote(summary.note), tags: summary.tags, excerpt: summary.plainText.slice(0, SNIPPET_LENGTH) })),
            };
          },
        };
      },
    },
    {
      name: "get_note",
      title: "Read a note",
      description: `Returns a note with its body as Markdown. Attachments appear as links to ${ATTACHMENT_HREF_PREFIX}<id>; keep those links unchanged when writing the body back so the attachments stay in the note.`,
      category: "read",
      destructiveHint: false,
      inputSchema: objectSchema(NOTE_ID_PROPERTY, ["noteId"]),
      prepare: async (toolArguments) => {
        const note = noteOf(toolArguments);
        return {
          preview: { kind: "readNote", noteId: note.id, title: note.content.title },
          isCurrent: ALWAYS_CURRENT,
          run: async () => ({ ...describeNote(note), markdown: markdownOf(note), attachments: note.content.attachments }),
        };
      },
    },
    {
      name: "list_notebooks",
      title: "List notebooks",
      description: "Returns the notebooks as a tree, with how many notes each one holds.",
      category: "read",
      destructiveHint: false,
      inputSchema: objectSchema({}),
      prepare: async () => ({
        preview: { kind: "listNotebooks" },
        isCurrent: ALWAYS_CURRENT,
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
      }),
    },
    {
      name: "list_tags",
      title: "List tags",
      description: "Returns the #tags used in note bodies, with how many notes use each.",
      category: "read",
      destructiveHint: false,
      inputSchema: objectSchema({}),
      prepare: async () => ({
        preview: { kind: "listTags" },
        isCurrent: ALWAYS_CURRENT,
        run: async () => ({ tags: countTags(repository.notes().map(summarizeNote)) }),
      }),
    },
  ];
}
