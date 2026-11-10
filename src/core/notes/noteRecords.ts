// 同期する記録（メモとノートブック）の型。
//
// 1 件の記録が S3 の 1 オブジェクトになる。種類・タイトル・ノートブック名などは
// すべて暗号文の中に入れ、S3 には ID しか見せない。

export type AttachmentReference = {
  // S3 の blobs/<id> に置いた暗号文の ID。
  id: string;
  mimeType: string;
  fileName: string;
  byteLength: number;
};

export type NoteContent = {
  title: string;
  // エディタ（Tiptap）の文書の JSON。形はエディタが決めるので、ここでは検査しない。
  document: unknown;
  // UpNote と同じく、1 つのメモを複数のノートブックに入れられる。
  notebookIds: string[];
  pinned: boolean;
  bookmarked: boolean;
  // ゴミ箱に入れた時刻。null ならゴミ箱の外。
  trashedAt: string | null;
  attachments: AttachmentReference[];
  createdAt: string;
};

export type NotebookContent = {
  name: string;
  // 入れ子のノートブックの親。null なら最上位。
  parentId: string | null;
  createdAt: string;
};

type RecordHeader = {
  id: string;
  // ISO 8601。競合したときに新しい方を選ぶのに使う。
  updatedAt: string;
  // 最後に書いたデバイスの ID（ホスト名などは入れない）。
  updatedBy: string;
};

// removed は完全に削除した印（tombstone）。ほかのデバイスに削除を伝えるため、
// オブジェクトは消さずに中身を空にして残す。
export type NoteRecord = RecordHeader & { kind: "note" } & ({ removed: false; content: NoteContent } | { removed: true; content: null });
export type NotebookRecord = RecordHeader & { kind: "notebook" } & (
  | { removed: false; content: NotebookContent }
  | { removed: true; content: null }
);

export type SyncedRecord = NoteRecord | NotebookRecord;

export type LiveNote = NoteRecord & { removed: false };
export type LiveNotebook = NotebookRecord & { removed: false };
