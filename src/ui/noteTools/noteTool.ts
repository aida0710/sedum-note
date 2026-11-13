// メモを操作するツールの決まり。MCP のクライアント（mcp/mcpNoteTools.ts）と、アプリ内の AI のチャット（ai/）の
// 両方が、同じツールを使う。つなぎ方（MCP のプロトコル、Claude・OpenAI 互換の API）にはよらない。
//
// ツールの呼び出しは 2 段に分ける。prepare で引数を確かめ、何をするか（preview）を決め、run で実際に行う。
// MCP は prepare のあとすぐ run する。チャットは、設定の許可（ai/aiToolPermissions.ts）に従って、
// 聞いてから run するか、聞かずに run するか、run せずに断る。

// ツールの種類。チャットの許可は、この種類ごとに設定で選ぶ（読む・作る/直す・ゴミ箱とノートブックの削除・完全な削除）。
export type NoteToolCategory = "read" | "edit" | "trash" | "permanentDelete";

export type ToolArguments = Record<string, unknown>;

// 呼び出し側に伝える失敗（引数が違う、対象が無い、など）。AI はこの文を読んで、呼び方を直せる。
export class NoteToolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NoteToolError";
  }
}

// 承認のカードと、会話の中の活動の行に出す、呼び出しの中身。メモの本文の写しは入れない（会話に残すため）。
export type NoteToolPreview =
  | { kind: "searchNotes"; query: string | null; notebookName: string | null; tag: string | null; inTrash: boolean }
  | { kind: "readNote"; noteId: string; title: string }
  | { kind: "listNotebooks" }
  | { kind: "listTags" }
  | { kind: "createNote"; title: string; notebookNames: string[]; characterCount: number }
  | { kind: "updateNote"; noteId: string; title: string; changes: Array<{ field: "title" | "notebooks" | "pinned" | "bookmarked"; before: string; after: string }> }
  | { kind: "appendToNote"; noteId: string; title: string; characterCount: number }
  | { kind: "replaceNoteBody"; noteId: string; title: string }
  | { kind: "moveNoteToTrash" | "restoreNoteFromTrash" | "deleteNotePermanently"; noteId: string; title: string }
  | { kind: "createNotebook"; name: string; parentName: string | null }
  | { kind: "renameNotebook"; notebookId: string; before: string; after: string }
  | { kind: "deleteNotebook"; notebookId: string; name: string; noteCount: number; childCount: number };

export type PreparedNoteToolCall = {
  preview: NoteToolPreview;
  // 準備したあとで、対象が変わっていないか。変わっていたら run しない（本文の差分の案など、準備のときの中身に頼る呼び出し）。
  isCurrent: () => boolean;
  // 実際に行い、呼び出し側へ返す結果（JSON にできる値）を返す。
  run: () => Promise<unknown>;
};

export type NoteTool = {
  name: string;
  title: string;
  description: string;
  // 引数の JSON Schema（type は object）。数の範囲（minimum・maximum）は書かない（Claude の strict が対応していないため）。範囲は説明に書き、コードで丸める。
  inputSchema: Record<string, unknown>;
  category: NoteToolCategory;
  // MCP のクライアントに伝える、元に戻せない変更をするか（確認の出し方の手がかり）。
  destructiveHint: boolean;
  prepare: (toolArguments: ToolArguments) => Promise<PreparedNoteToolCall>;
};

// 準備のときの中身に頼らない呼び出し（いつ run しても同じ）。
export const ALWAYS_CURRENT = (): boolean => true;
