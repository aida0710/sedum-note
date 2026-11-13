// MCP のクライアント（AI）に見せる、メモの操作のツール。中身はアプリ内の AI のチャットと同じ（noteTools/）で、
// ここでは MCP のツールの形に写す。MCP では、準備（prepare）のあとすぐに行う（確認を出すかはクライアントが決める）。
//
// 本文は Markdown でやり取りする。添付は中身を渡さず、ID を指すリンク（sedum-note://attachment/<id>）で表す。
// 読んだ Markdown のリンクをそのまま書き戻せば、同じ添付が本文に戻る。

import { McpToolError, type McpTool } from "../../core/mcp/mcpServer";
import type { NoteRepository } from "../../core/notes/noteRepository";
import { createNoteTools } from "../noteTools/createNoteTools";
import { type NoteTool, NoteToolError } from "../noteTools/noteTool";

export type McpNoteToolOptions = {
  // 完全な削除（元に戻せない）のツールを出すか（MCP の設定の「完全な削除を許す」）。
  allowPermanentDelete: boolean;
};

function mcpToolOf(tool: NoteTool): McpTool {
  return {
    name: tool.name,
    title: tool.title,
    description: tool.description,
    inputSchema: tool.inputSchema,
    readOnly: tool.category === "read",
    destructive: tool.destructiveHint,
    run: async (toolArguments) => {
      try {
        const prepared = await tool.prepare(toolArguments);
        return await prepared.run();
      } catch (error) {
        throw error instanceof NoteToolError ? new McpToolError(error.message) : error;
      }
    },
  };
}

export function createMcpNoteTools(repository: NoteRepository, options: McpNoteToolOptions): McpTool[] {
  return createNoteTools(repository, { includesPermanentDelete: options.allowPermanentDelete }).map(mcpToolOf);
}

// クライアント（AI）に渡す、このサーバーの使い方。
export const NOTE_SERVER_INSTRUCTIONS =
  "Sedum Note: the user's end-to-end encrypted notes, available while the app is unlocked. " +
  "Find notes with search_notes, read one with get_note (the body is Markdown). " +
  "To add text use append_to_note; replace_note_body rewrites the whole body. " +
  "Notes go to the trash with move_note_to_trash and can be restored.";
