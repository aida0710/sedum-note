// 画面に渡す記録（メモ、ノートブック、保存した検索）の形。中身は Yjs の文書（recordDocument.ts）から読む。
//
// 1 件の記録が S3 の 1 オブジェクトになる。種類・タイトル・ノートブック名などは
// すべて暗号文の中に入れ、S3 には ID しか見せない。

import type * as Y from "yjs";
import type { PropertyDefinition, PropertyValue } from "./noteProperties";
import type { DatabaseView } from "./databaseView";

export type AttachmentReference = {
  // S3 の blobs/<id> に置いた暗号文の ID。
  id: string;
  mimeType: string;
  fileName: string;
  // 元のファイルの大きさ。古いメモの写真には記録が無く、そのときは 0。
  byteLength: number;
};

// 本文の列を、画面の左・中央・右のどこに置くか。
export const PAGE_ALIGNMENTS = ["left", "center", "right"] as const;
export type PageAlignment = (typeof PAGE_ALIGNMENTS)[number];

export type NoteContent = {
  title: string;
  // UpNote と同じく、1 つのメモを複数のノートブックに入れられる。
  notebookIds: string[];
  pinned: boolean;
  bookmarked: boolean;
  // ゴミ箱に入れた時刻。null ならゴミ箱の外。
  trashedAt: string | null;
  // 新しいメモの型として使うメモ。ふつうの一覧には出さず、「テンプレート」に並べる。
  // テンプレートを知らない版（v0.2.0）のアプリでは、ふつうのメモとして見える。
  isTemplate: boolean;
  // メモの期限（dueTimes.ts の形）。null なら期限なし。期限が来たら知らせる。
  dueAt: string | null;
  // 本文の列の置き場所。null なら、このデバイスの表示の設定（既定の置き場所）に従う。
  // 知らない値（新しい版のアプリが足したもの）も null として読む。
  pageAlignment: PageAlignment | null;
  // 本文に貼ってある添付（本文から導く）。
  attachments: AttachmentReference[];
  // プロパティの値。キーはプロパティの ID。値の無いプロパティは入らない。
  propertyValues: Record<string, PropertyValue>;
  createdAt: string;
};

export type NotebookContent = {
  name: string;
  // 入れ子のノートブックの親。null なら最上位。
  parentId: string | null;
  // 利用者が選んだ色とアイコンの名前（画面が持つ一覧の中の名前）。null なら自動の色で、アイコンなし。
  // 画面は、知らない名前（新しい版のアプリが足したもの）を null と同じに扱う。
  colorName: string | null;
  iconName: string | null;
  // このノートブックのメモに付けられるプロパティの定義。並び順（order）の順。
  properties: PropertyDefinition[];
  // データベース表示の並べ方と見え方。
  databaseView: DatabaseView;
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

// 保存した検索。左の列から 1 回で、同じ条件の検索を開く。
export type SavedSearchContent = {
  name: string;
  searchText: string;
  // 検索する範囲。どちらも null なら、すべてのメモ。
  notebookId: string | null;
  tag: string | null;
  createdAt: string;
};

export type LiveSavedSearch = RecordHeader & { kind: "savedSearch"; content: SavedSearchContent };

export type LiveRecord = LiveNote | LiveNotebook | LiveSavedSearch;
