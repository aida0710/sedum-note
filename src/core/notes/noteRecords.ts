// 画面に渡す記録（メモとノートブック）の形。中身は Yjs の文書（recordDocument.ts）から読む。
//
// 1 件の記録が S3 の 1 オブジェクトになる。種類・タイトル・ノートブック名などは
// すべて暗号文の中に入れ、S3 には ID しか見せない。

import type * as Y from "yjs";

export type AttachmentReference = {
  // S3 の blobs/<id> に置いた暗号文の ID。
  id: string;
  mimeType: string;
  fileName: string;
};

export type NoteContent = {
  title: string;
  // UpNote と同じく、1 つのメモを複数のノートブックに入れられる。
  notebookIds: string[];
  pinned: boolean;
  bookmarked: boolean;
  // ゴミ箱に入れた時刻。null ならゴミ箱の外。
  trashedAt: string | null;
  // 本文に貼ってある添付（本文から導く）。
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
  // ISO 8601。最後に変えられた時刻（一覧の並び順に使う）。
  updatedAt: string;
  // 中身が変わるたびに増える。要約のキャッシュが古いかを見分けるのに使う。
  revision: number;
};

export type LiveNote = RecordHeader & {
  kind: "note";
  content: NoteContent;
  // 本文。エディタに渡して直接編集する。
  body: Y.XmlFragment;
};

export type LiveNotebook = RecordHeader & { kind: "notebook"; content: NotebookContent };
