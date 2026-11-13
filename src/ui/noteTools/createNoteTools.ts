// メモを操作するツールの一覧。MCP（mcp/mcpNoteTools.ts）とアプリ内の AI のチャット（ai/）が、同じ一覧を使う。

import type { NoteRepository } from "../../core/notes/noteRepository";
import { noteChangeTools, permanentDeleteTool } from "./noteChangeTools";
import type { NoteTool } from "./noteTool";
import { createNoteToolContext } from "./noteToolContext";
import { noteReadTools } from "./noteReadTools";

export type NoteToolOptions = {
  // 完全な削除（元に戻せない）のツールを一覧に入れるか。
  includesPermanentDelete: boolean;
};

export function createNoteTools(repository: NoteRepository, options: NoteToolOptions): NoteTool[] {
  const context = createNoteToolContext(repository);
  return [...noteReadTools(context), ...noteChangeTools(context), ...(options.includesPermanentDelete ? [permanentDeleteTool(context)] : [])];
}
