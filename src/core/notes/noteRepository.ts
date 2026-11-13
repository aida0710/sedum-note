// ロック解除中のメモとノートブック。記録ごとに Yjs の文書をメモリに持ち、変更を暗号化して
// 手元に書き、「送っていない」の印を付ける（送るのは SyncEngine）。
//
// 手元の記録の書き込みは、すべてここを通す。同期で取り込むときは
// 「開いている文書へマージ → 手元へ保存 → ETag を記録」を 1 つの処理にする。ETag だけを
// 先に進めると、次に If-Match で送る中身が同期先の中身を含まなくなり、ほかのデバイスの
// 編集を黙って消してしまう。

import * as Y from "yjs";
import { newRandomId } from "../crypto/randomId";
import { open, seal } from "../crypto/sealedBox";
import type { LocalRecordEntry, LocalStore } from "../local/localStore";
import type { WriteQueue } from "../local/serialQueue";
import { blobBinding } from "../sync/remoteLayout";
import { changesBodyContent } from "./bodyContentChange";
import { copyBodyBlocks, replaceBodyWithCopyOf } from "./bodyCopy";
import { bodyAttachments } from "./bodyText";
import { databaseViewFromField } from "./databaseView";
import { isDueTime } from "./dueTimes";
import { linkFirstMention } from "./noteMentions";
import { isNotebookWithin } from "./noteQueries";
import { PROPERTY_DEFINITION_FIELD_PREFIX, PROPERTY_VALUE_FIELD_PREFIX, type PropertyDefinition, propertyDefinitionFromField, type PropertyValue } from "./noteProperties";
import { type AttachmentReference, type LiveNote, type LiveNotebook, type LiveRecord, type LiveSavedSearch, type NotebookContent, PAGE_ALIGNMENTS, type PageAlignment, type SavedSearchContent } from "./noteRecords";
import { type NoteVersion, NoteVersionHistory, type OverwriteReason } from "./noteVersions";
import type { RecordChangeChannel } from "./recordChangeChannel";
import { openRecordPayload, type RecordPayload, sealRecordPayload } from "./recordCodec";
import {
  encodeRecordState,
  FIELD_ORIGIN,
  fieldNames,
  latestFieldTime,
  readField,
  recordBody,
  recordDocumentFromState,
  type RecordKind,
  REMOTE_ORIGIN,
  writeField,
} from "./recordDocument";
import { replaceTemplateVariablesInBody, replaceTemplateVariablesInText, type TemplateTimeValues, type TemplateVariableValues } from "./templateVariables";

// 最初の変更からこれだけ待って、その間の変更をまとめて手元に保存する。暗号化と書き込みは
// 非同期なので、アプリを閉じる瞬間には書き切れない。打ってすぐ閉じても失うのがこの時間の分で
// 済むよう短くしつつ、毎打鍵の暗号化は避ける。
const PERSIST_DELAY_MILLISECONDS = 150;
// ノートブックへの所属の項目名の先頭。後ろにノートブックの ID が続く。
const NOTEBOOK_MEMBERSHIP_PREFIX = "notebook:";

export type NoteRepositoryDependencies = {
  localStore: LocalStore;
  masterKey: CryptoKey;
  deviceId: string;
  writeQueue: WriteQueue;
  // 同じ手元の保存を開いている、ほかのウィンドウとの通り道。渡さなければ、ほかのウィンドウは無いものとして動く。
  recordChangeChannel?: RecordChangeChannel;
  // 手元に無い添付を同期先から取る。同期先を設定していなければ null を返す。
  downloadBlob: (id: string) => Promise<Uint8Array | null>;
  // ほかのデバイスが残したメモの履歴を、同期先から取る。同期先を設定していなければ何もしない。
  downloadVersions: (noteId: string) => Promise<void>;
  now?: () => Date;
};

export type NoteChanges = Partial<{
  title: string;
  notebookIds: string[];
  pinned: boolean;
  bookmarked: boolean;
  trashedAt: string | null;
  isTemplate: boolean;
  dueAt: string | null;
  pageAlignment: PageAlignment | null;
}>;

export type TemplateNoteInput = {
  templateId: string;
  // テンプレートの変数 @date・@time・@datetime の値。言語と設定に合わせた文字を、呼び出し側が作って渡す。
  timeValues: TemplateTimeValues;
  changes?: NoteChanges;
};

// local は、このデバイスで変えたもの（同期で送る必要がある）。stored は、手元の保存や
// 同期から読み直したもの。
export type RepositoryChangeOrigin = "local" | "stored";

// ほかのウィンドウが手元の保存に書いた中身を、開いている文書へマージするときの origin。このウィンドウの編集ではないので、
// 保存の予約はしない（書いたのは相手のウィンドウ）。
const OTHER_WINDOW_ORIGIN = "otherWindow";
// データの形の移し替え（format/dataFormatMigrations.ts）で書き換えた変更。利用者の編集ではないので、更新日時を変えず、履歴も残さない。
const MIGRATION_ORIGIN = "dataFormatMigration";

type LiveHolder = {
  state: "live";
  doc: Y.Doc;
  // このウィンドウが最後に読むか書くかした、手元の保存の暗号文。手元の保存がこれと違えば、ほかのウィンドウが書いている。
  lastStoredSealed: Uint8Array | null;
  revision: number;
  cachedView: LiveRecord | null;
  // 本文の中身を変えて、まだ「編集した時刻」を書いていない（折りたたみなどの、中身を変えない属性だけの変更は入らない）。
  bodyEdited: boolean;
};
type RemovedHolder = { state: "removed"; removedAt: string; attachmentIds: string[] };
type Holder = LiveHolder | RemovedHolder;

// 結合したメモのタイトルを入れる見出しの段。メモのタイトルの下に並ぶので、2 段目にする。
const MERGED_NOTE_HEADING_LEVEL = 2;

export class RecordNotFoundError extends Error {
  constructor(id: string) {
    super(`no record ${id}`);
    this.name = "RecordNotFoundError";
  }
}

export class NoteRepository {
  readonly #dependencies: NoteRepositoryDependencies;
  readonly #holders = new Map<string, Holder>();
  readonly #listeners = new Set<(origin: RepositoryChangeOrigin) => void>();
  // このデバイスで変えて、まだ手元に保存していない記録。
  readonly #unsavedIds = new Set<string>();
  // 手元に保存して、まだ同期先へ送っていない記録。
  readonly #waitingForPushIds = new Set<string>();
  #unreadableIds: string[] = [];
  #persistTimer: ReturnType<typeof setTimeout> | null = null;
  #closed = false;
  readonly #versionHistory: NoteVersionHistory;

  constructor(dependencies: NoteRepositoryDependencies) {
    this.#dependencies = dependencies;
    this.#versionHistory = new NoteVersionHistory({
      localStore: dependencies.localStore, masterKey: dependencies.masterKey, now: () => this.#now(),
    });
    dependencies.recordChangeChannel?.subscribe((recordId) => void this.#adoptRecordStoredByOtherWindow(recordId));
  }

  async load(): Promise<void> {
    this.#holders.clear();
    this.#unreadableIds = [];
    this.#waitingForPushIds.clear();
    for (const entry of await this.#dependencies.localStore.listRecordEntries()) {
      try {
        this.#hold(entry.id, await openRecordPayload(this.#dependencies.masterKey, entry.id, entry.sealed), entry.sealed);
        if (entry.waitingForPush) {
          this.#waitingForPushIds.add(entry.id);
        }
      } catch {
        this.#unreadableIds.push(entry.id);
      }
    }
    this.#notify("stored");
  }

  // データの形の移し替えの手順を、読み込んだ全部の記録に流し、変わった記録を手元に書く（送る記録にもなる）。
  async migrateRecords(migrateRecord: (doc: Y.Doc) => void): Promise<void> {
    for (const holder of this.#holders.values()) {
      if (holder.state === "live") {
        holder.doc.transact(() => migrateRecord(holder.doc), MIGRATION_ORIGIN);
      }
    }
    await this.flush();
  }

  subscribe(listener: (origin: RepositoryChangeOrigin) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  notes(): LiveNote[] {
    return this.#views().filter((view): view is LiveNote => view.kind === "note");
  }

  notebooks(): LiveNotebook[] {
    return this.#views().filter((view): view is LiveNotebook => view.kind === "notebook");
  }

  note(id: string): LiveNote | undefined {
    const view = this.#view(id);
    return view?.kind === "note" ? view : undefined;
  }

  unreadableIds(): string[] {
    return [...this.#unreadableIds];
  }

  // まだ同期先へ送っていない記録の ID（手元に保存する前のものも含む）。
  unsyncedIds(): ReadonlySet<string> {
    return new Set([...this.#waitingForPushIds, ...this.#unsavedIds]);
  }

  async createNote(initial: NoteChanges = {}): Promise<LiveNote> {
    const id = newRandomId();
    const doc = this.#newDocument(id, "note");
    // 本文には最初から空の段落を 1 つ入れておく。空のままだと、開いたデバイスごとにエディタが
    // 段落を足し、マージしたときに空の段落が重なる。
    recordBody(doc).insert(0, [new Y.XmlElement("paragraph")]);
    this.#writeNoteChanges(doc, { title: "", pinned: false, bookmarked: false, trashedAt: null, notebookIds: [], ...initial });
    await this.flush();
    return this.note(id)!;
  }

  async updateNote(id: string, changes: NoteChanges): Promise<void> {
    this.#writeNoteChanges(this.#liveDocument(id, "note"), changes);
  }

  async moveNoteToTrash(id: string): Promise<void> {
    await this.updateNote(id, { trashedAt: this.#now().toISOString(), pinned: false });
  }

  async restoreNoteFromTrash(id: string): Promise<void> {
    await this.updateNote(id, { trashedAt: null });
  }

  // 完全に削除する。ほかのデバイスに伝えるため、削除の印を残す。貼ってあった添付も消す。
  // 複製やテンプレートから作ったメモは同じ添付を指すので、ほかのメモの今の本文がまだ使っている添付は消さない。
  async removeNotePermanently(id: string): Promise<void> {
    const usedElsewhere = new Set(this.notes().filter((note) => note.id !== id).flatMap((note) => note.content.attachments.map((attachment) => attachment.id)));
    const attachmentIds = bodyAttachments(recordBody(this.#liveDocument(id, "note")))
      .map((attachment) => attachment.id)
      .filter((attachmentId) => !usedElsewhere.has(attachmentId));
    await this.#removeRecord(id, attachmentIds);
  }

  // ── 履歴 ──────────────────────────────────

  // ほかのデバイスが残した履歴を同期先から取ってきて、手元の履歴に足す。同期先に届かなければ失敗する
  // （手元にある分は、そのまま noteVersions で読める）。
  downloadNoteVersions(noteId: string): Promise<void> {
    return this.#dependencies.downloadVersions(noteId);
  }

  noteVersions(noteId: string): Promise<NoteVersion[]> {
    return this.#versionHistory.list(noteId);
  }

  // 本文を丸ごと置き換える前（MCP・プラグイン）に呼ぶ。間隔に関わらず、今の状態を履歴に残す（置き換えを取り消せるように）。
  async captureVersionBeforeReplace(noteId: string): Promise<void> {
    await this.#captureVersionBeforeOverwrite(noteId, "replace");
  }

  // メモを、履歴の版の中身に戻す。別のメモは作らず、このメモを書き換える。戻す前の状態は「復元の前」として履歴に残す。
  // メモか版が無ければ RecordNotFoundError。
  //
  // 版の Yjs の状態を今の文書にマージしても、何も戻らない（版の操作は、今の文書にもう含まれている）。版の本文を写して、
  // 今の本文への新しい操作として書く。そのため、エディタで開いたままでも、ほかのデバイスの同時の編集とも、ふつうの編集と
  // 同じくマージされる。
  async restoreNoteToVersion(input: { noteId: string; versionId: string }): Promise<void> {
    // メモが無ければ、版を開く前に断る。
    this.#liveDocument(input.noteId, "note");
    const versionDocument = await this.#versionHistory.openVersionDocument(input.noteId, input.versionId);
    if (versionDocument === null) {
      throw new RecordNotFoundError(input.versionId);
    }
    try {
      await this.#captureVersionBeforeOverwrite(input.noteId, "restore");
      // 履歴を残す間に、ほかのウィンドウや同期が文書を入れ替えていることがあるので、取り直す。
      const doc = this.#liveDocument(input.noteId, "note");
      replaceBodyWithCopyOf(recordBody(doc), recordBody(versionDocument));
      this.#writeNoteChanges(doc, restoredNoteChanges({ current: doc, version: versionDocument }));
      await this.flush();
    } finally {
      versionDocument.destroy();
    }
  }

  // テンプレートと同じ本文の、新しいメモを作る。テンプレートは変えない。
  // 題と本文のテンプレートの変数（@date など）は、渡された日時と、できあがるメモの題に置き換える。
  // 題は changes.title、無ければテンプレートの題の変数を置き換えたもの。題の中の @title は置き換えない（題そのものなので）。
  async createNoteFromTemplate({ templateId, timeValues, changes = {} }: TemplateNoteInput): Promise<LiveNote> {
    const template = this.note(templateId);
    if (!template) {
      throw new RecordNotFoundError(templateId);
    }
    const title = changes.title ?? replaceTemplateVariablesInText(template.content.title, timeValues);
    return this.#createNoteWithBodyOf(template.body, { pageAlignment: template.content.pageAlignment, ...changes, title }, { ...timeValues, title });
  }

  // メモを複製する。本文とノートブックを引き継ぎ、添付は同じものを指す。
  async duplicateNote(noteId: string, title: string): Promise<LiveNote> {
    const source = this.note(noteId);
    if (!source) {
      throw new RecordNotFoundError(noteId);
    }
    return this.#createNoteWithBodyOf(source.body, { title, notebookIds: source.content.notebookIds, isTemplate: false, pageAlignment: source.content.pageAlignment });
  }

  // mentioningNoteId の本文に文字のまま書かれた、target の題を、target へのリンクに置き換える（リンクしていない言及）。
  // 最初の 1 か所だけを置き換える。置き換えられる所が無ければ false。
  async linkMention(mentioningNoteId: string, target: { noteId: string; title: string }): Promise<boolean> {
    return linkFirstMention(recordBody(this.#liveDocument(mentioningNoteId, "note")), target);
  }

  // ほかのメモを、このメモに結合する。相手のタイトルを見出しにして本文を末尾に足し、相手はゴミ箱に入れる。
  async mergeNoteInto(targetId: string, sourceId: string): Promise<void> {
    const source = this.note(sourceId);
    if (!source) {
      throw new RecordNotFoundError(sourceId);
    }
    const targetBody = recordBody(this.#liveDocument(targetId, "note"));
    const heading = new Y.XmlElement("heading");
    heading.setAttribute("level", MERGED_NOTE_HEADING_LEVEL as never);
    heading.insert(0, [new Y.XmlText(source.content.title)]);
    targetBody.insert(targetBody.length, [heading, ...copyBodyBlocks(source.body)]);
    await this.moveNoteToTrash(sourceId);
  }

  // 元の本文を写した、新しいメモを作る。variableValues を渡すと、写した本文のテンプレートの変数を置き換える
  // （元の本文は変えない）。写してから await を挟まずに置き換えるので、手元へ保存するのは置き換えたあとの本文になる。
  async #createNoteWithBodyOf(sourceBody: Y.XmlFragment, changes: NoteChanges, variableValues: TemplateVariableValues | null = null): Promise<LiveNote> {
    const id = newRandomId();
    const doc = this.#newDocument(id, "note");
    recordBody(doc).insert(0, copyBodyBlocks(sourceBody));
    if (variableValues !== null) {
      replaceTemplateVariablesInBody(recordBody(doc), variableValues);
    }
    this.#writeNoteChanges(doc, { title: "", pinned: false, bookmarked: false, trashedAt: null, notebookIds: [], ...changes });
    await this.flush();
    return this.note(id)!;
  }

  async createNotebook(name: string, parentId: string | null = null): Promise<LiveNotebook> {
    const id = newRandomId();
    const doc = this.#newDocument(id, "notebook");
    this.#writeFields(doc, { name, parentId });
    await this.flush();
    return this.#view(id) as LiveNotebook;
  }

  // ── プロパティ ────────────────────────────────

  // ノートブックにプロパティの定義を足す。id を渡すと、その定義を書き換える。
  async saveNotebookProperty(notebookId: string, definition: Omit<PropertyDefinition, "id"> & { id?: string }): Promise<PropertyDefinition> {
    const { id = newRandomId(), ...fields } = definition;
    this.#writeFields(this.#liveDocument(notebookId, "notebook"), { [PROPERTY_DEFINITION_FIELD_PREFIX + id]: fields });
    return { id, ...fields };
  }

  // 定義を消す。メモに付けた値は記録に残るが、定義が無いので画面には出ない。
  async removeNotebookProperty(notebookId: string, propertyId: string): Promise<void> {
    this.#writeFields(this.#liveDocument(notebookId, "notebook"), { [PROPERTY_DEFINITION_FIELD_PREFIX + propertyId]: null });
  }

  async setNotePropertyValue(noteId: string, propertyId: string, value: PropertyValue): Promise<void> {
    this.#writeFields(this.#liveDocument(noteId, "note"), { [PROPERTY_VALUE_FIELD_PREFIX + propertyId]: value });
  }

  async updateNotebook(id: string, changes: Partial<Omit<NotebookContent, "createdAt" | "properties">>): Promise<void> {
    this.#writeFields(this.#liveDocument(id, "notebook"), changes);
  }

  // ノートブックを、別のノートブックの中（parentId が null なら一番上の段）へ移す。中のメモと子のノートブックも一緒に移る。
  // 自分の中（自分と、その下のノートブック）へは移せない（親子が輪になり、左の列から消える）。
  async moveNotebook(id: string, parentId: string | null): Promise<void> {
    if (parentId !== null && isNotebookWithin(this.notebooks(), parentId, id)) {
      throw new Error("a notebook cannot be moved into itself or a notebook inside it");
    }
    await this.updateNotebook(id, { parentId });
  }

  // ノートブックを消す。中のメモは消さず、そのノートブックから外すだけにする。
  async removeNotebook(id: string): Promise<void> {
    const parentId = readField<string | null>(this.#liveDocument(id, "notebook"), "parentId") ?? null;
    for (const note of this.notes().filter((candidate) => candidate.content.notebookIds.includes(id))) {
      await this.updateNote(note.id, { notebookIds: note.content.notebookIds.filter((notebookId) => notebookId !== id) });
    }
    for (const child of this.notebooks().filter((candidate) => candidate.content.parentId === id)) {
      await this.updateNotebook(child.id, { parentId });
    }
    await this.#removeRecord(id, []);
  }

  // ── 保存した検索 ──────────────────────────────

  savedSearches(): LiveSavedSearch[] {
    return this.#views().filter((view): view is LiveSavedSearch => view.kind === "savedSearch")
      .sort((left, right) => left.content.createdAt.localeCompare(right.content.createdAt));
  }

  async createSavedSearch(search: Omit<SavedSearchContent, "createdAt">): Promise<LiveSavedSearch> {
    const id = newRandomId();
    this.#writeFields(this.#newDocument(id, "savedSearch"), search);
    await this.flush();
    return this.#view(id) as LiveSavedSearch;
  }

  async removeSavedSearch(id: string): Promise<void> {
    this.#liveDocument(id, "savedSearch");
    await this.#removeRecord(id, []);
  }

  // 写真などを暗号化して手元に置く。本文への貼り付けは呼び出し側（エディタ）が行う。
  async storeAttachment(input: { bytes: Uint8Array; mimeType: string; fileName: string }): Promise<AttachmentReference> {
    const id = newRandomId();
    const sealed = await seal(this.#dependencies.masterKey, input.bytes, blobBinding(id));
    await this.#dependencies.localStore.putBlob({ id, sealed, uploaded: false });
    return { id, mimeType: input.mimeType, fileName: input.fileName, byteLength: input.bytes.length };
  }

  async readAttachment(id: string): Promise<Uint8Array | null> {
    const local = await this.#dependencies.localStore.getBlob(id);
    const sealed = local?.sealed ?? (await this.#dependencies.downloadBlob(id));
    return sealed === null ? null : open(this.#dependencies.masterKey, sealed, blobBinding(id));
  }

  // ロックするときや、同期先をつなぎ直して別の repository に入れ替えるときに呼ぶ。ほかのウィンドウの書き込みを、
  // 受け取らなくする（ロックしたあとの画面が、ほかのウィンドウの編集を復号し続けないように）。
  release(): void {
    this.#dependencies.recordChangeChannel?.close();
  }

  // このデバイスのデータを消す前に呼ぶ。保存を待っている入力を捨て、書いている途中のものが
  // 終わるのを待つ。以後の入力は保存しない（消したデータを書き戻さないため）。
  async close(): Promise<void> {
    this.#closed = true;
    this.release();
    this.#cancelPersistTimer();
    this.#unsavedIds.clear();
    await this.#dependencies.writeQueue.run(async () => undefined);
  }

  // まだ手元に保存していない変更を、待たずに保存する。画面を離れるときと、同期の前に呼ぶ。
  async flush(): Promise<void> {
    this.#cancelPersistTimer();
    const ids = [...this.#unsavedIds];
    for (const id of ids) {
      await this.#dependencies.writeQueue.run(() => this.#persistLive(id, { remoteEtag: undefined }));
    }
    if (ids.length > 0) {
      this.#notify("local");
    }
  }

  // ── 同期（SyncEngine）から使うもの ──────────────────────────

  async entriesWaitingForPush(): Promise<LocalRecordEntry[]> {
    await this.flush();
    const { localStore } = this.#dependencies;
    const waiting: LocalRecordEntry[] = [];
    for (const state of await localStore.listRecordStates()) {
      const entry = state.waitingForPush ? await localStore.getRecordEntry(state.id) : undefined;
      if (entry) {
        waiting.push(entry);
      }
    }
    return waiting;
  }

  // 同期先の記録を取り込む。開けなければ InvalidRecordError か SealedBoxError を投げる。
  async applyRemote(id: string, sealed: Uint8Array, remoteEtag: string): Promise<void> {
    const payload = await openRecordPayload(this.#dependencies.masterKey, id, sealed);
    await this.#dependencies.writeQueue.run(async () => {
      const entry = await this.#dependencies.localStore.getRecordEntry(id);
      const holder = this.#holders.get(id);
      const hasLocalChanges = (entry?.waitingForPush ?? false) || this.#unsavedIds.has(id);
      if (payload.kind === "state" && holder?.state === "live") {
        const stateBeforeMerge = Y.encodeStateVector(holder.doc);
        Y.applyUpdate(holder.doc, payload.state, REMOTE_ORIGIN);
        if (entry && !sameBytes(stateBeforeMerge, Y.encodeStateVector(holder.doc)) && this.#view(id)?.kind === "note") {
          await this.#versionHistory.captureBeforeSync(id, entry.sealed);
        }
        this.#touch(holder);
        await this.#persistLive(id, { remoteEtag, waitingForPush: hasLocalChanges });
        return;
      }
      if (payload.kind === "removed" && holder?.state === "live" && hasLocalChanges) {
        // ほかのデバイスで完全に削除されたが、このデバイスには送っていない編集がある。編集を残し、
        // 削除の印の上へ送り直す。同期先の添付は消されているので、手元にある分を送り直す。
        await this.#markAttachmentsForUpload(bodyAttachments(recordBody(holder.doc)));
        await this.#persistLive(id, { remoteEtag, waitingForPush: true });
        return;
      }
      // 手元に無い記録、手元で消した記録への編集、または削除の受け入れ。同期先の中身をそのまま採る。
      if (holder?.state === "live") {
        holder.doc.destroy();
      }
      this.#unsavedIds.delete(id);
      this.#hold(id, payload, sealed);
      if (payload.kind === "removed") {
        await this.#deleteLocalBlobs(payload.attachmentIds);
        await this.#versionHistory.forget(id);
      }
      await this.#putEntry({ id, sealed, remoteEtag, waitingForPush: false });
    });
    this.#notify("stored");
  }

  // 送り終えた記録に ETag を記録する。送っている間に変わっていなければ「揃った」にする。
  // 削除の印を送り終えたときは、recordRemoved を true にし、同期先から消してよい添付の ID を返す。
  async confirmPushed(sent: LocalRecordEntry, remoteEtag: string): Promise<{ removedAttachmentIds: string[]; recordRemoved: boolean }> {
    await this.#dependencies.writeQueue.run(async () => {
      const latest = await this.#dependencies.localStore.getRecordEntry(sent.id);
      const unchanged = latest !== undefined && sameBytes(latest.sealed, sent.sealed) && !this.#unsavedIds.has(sent.id);
      await this.#putEntry({ id: sent.id, sealed: latest?.sealed ?? sent.sealed, remoteEtag, waitingForPush: !unchanged });
    });
    this.#notify("stored");
    const holder = this.#holders.get(sent.id);
    const recordRemoved = holder?.state === "removed" && !this.#waitingForPushIds.has(sent.id);
    return { removedAttachmentIds: recordRemoved ? holder.attachmentIds : [], recordRemoved };
  }

  // 完全に削除した記録か（削除の印を持っている）。
  isRemoved(id: string): boolean {
    return this.#holders.get(id)?.state === "removed";
  }

  // 同期先から消えた記録を、手元の写しから送り直す対象にする（どこかで消えても、データを失わない）。
  async markMissingRemotely(id: string): Promise<void> {
    await this.#dependencies.writeQueue.run(async () => {
      const latest = await this.#dependencies.localStore.getRecordEntry(id);
      if (latest) {
        await this.#putEntry({ ...latest, remoteEtag: null, waitingForPush: true });
      }
    });
  }

  // ── 内部 ──────────────────────────────────────────

  // 本文を丸ごと書き換える前に、今の状態を履歴に残す。まだ保存していない入力を先に保存し、それも含めて残す。
  async #captureVersionBeforeOverwrite(noteId: string, reason: OverwriteReason): Promise<void> {
    await this.flush();
    const stored = await this.#dependencies.localStore.getRecordEntry(noteId);
    if (stored && this.#view(noteId)?.kind === "note") {
      await this.#versionHistory.captureBeforeOverwrite(noteId, stored.sealed, reason);
    }
  }

  #newDocument(id: string, kind: RecordKind): Y.Doc {
    const doc = new Y.Doc();
    this.#holders.set(id, { state: "live", doc, lastStoredSealed: null, revision: 0, cachedView: null, bodyEdited: false });
    this.#watch(id, doc);
    this.#writeFields(doc, { kind, createdAt: this.#now().toISOString() });
    return doc;
  }

  // storedSealed は、この中身を読んだ手元の保存の暗号文。同期先から受け取った中身のように、まだ手元に書いていなければ null。
  #hold(id: string, payload: RecordPayload, storedSealed: Uint8Array | null = null): void {
    if (payload.kind === "removed") {
      this.#holders.set(id, { state: "removed", removedAt: payload.removedAt, attachmentIds: payload.attachmentIds });
      return;
    }
    const doc = recordDocumentFromState(payload.state);
    this.#holders.set(id, { state: "live", doc, lastStoredSealed: storedSealed, revision: 0, cachedView: null, bodyEdited: false });
    this.#watch(id, doc);
  }

  // ほかのウィンドウが手元の保存に書いた記録を、このウィンドウの文書に取り込む。
  async #adoptRecordStoredByOtherWindow(id: string): Promise<void> {
    if (this.#closed) {
      return;
    }
    await this.#dependencies.writeQueue.run(async () => {
      const stored = await this.#dependencies.localStore.getRecordEntry(id);
      if (stored) {
        await this.#mergeStoredEntry(stored);
        this.#rememberWaitingForPush(stored);
      }
    });
    // 同期を受け持つウィンドウが、相手の編集を送れるように、このデバイスでの変更として知らせる。
    this.#notify("local");
  }

  // 手元の保存にある中身を、開いている文書に取り込む。writeQueue の中から呼ぶ。開けない中身は取り込まない。
  // 相手のウィンドウが記録を完全に削除していたら、このウィンドウでも削除にして false を返す（まだ保存していない編集は捨てる）。
  async #mergeStoredEntry(stored: LocalRecordEntry): Promise<boolean> {
    const holder = this.#holders.get(stored.id);
    if (holder?.state === "live" && holder.lastStoredSealed !== null && sameBytes(holder.lastStoredSealed, stored.sealed)) {
      return true;
    }
    let payload: RecordPayload;
    try {
      payload = await openRecordPayload(this.#dependencies.masterKey, stored.id, stored.sealed);
    } catch {
      return true;
    }
    if (payload.kind === "state" && holder?.state === "live") {
      Y.applyUpdate(holder.doc, payload.state, OTHER_WINDOW_ORIGIN);
      holder.lastStoredSealed = stored.sealed;
      return true;
    }
    if (payload.kind === "removed" && holder?.state === "removed") {
      return false;
    }
    if (holder?.state === "live") {
      holder.doc.destroy();
    }
    this.#unsavedIds.delete(stored.id);
    this.#hold(stored.id, payload, stored.sealed);
    return payload.kind === "state";
  }

  // このデバイスでの変更（エディタの入力と項目の書き込み）を見張り、保存を予約する。
  #watch(id: string, doc: Y.Doc): void {
    doc.on("update", (_update: Uint8Array, origin: unknown, _doc: Y.Doc, transaction: Y.Transaction) => {
      const holder = this.#holders.get(id);
      if (origin === REMOTE_ORIGIN || holder?.state !== "live") {
        return;
      }
      this.#touch(holder);
      if (origin === OTHER_WINDOW_ORIGIN) {
        return;
      }
      if (origin !== FIELD_ORIGIN && origin !== MIGRATION_ORIGIN && changesBodyContent(transaction)) {
        holder.bodyEdited = true;
      }
      if (this.#closed) {
        return;
      }
      this.#unsavedIds.add(id);
      this.#persistTimer ??= setTimeout(() => void this.flush(), PERSIST_DELAY_MILLISECONDS);
      if (origin === FIELD_ORIGIN) {
        // タイトルやピン留めは、一覧やタブにすぐ出す。本文の変更は保存のときに知らせる。
        this.#notify("stored");
      }
    });
  }

  #touch(holder: LiveHolder): void {
    holder.revision += 1;
    holder.cachedView = null;
  }

  #liveDocument(id: string, kind: RecordKind): Y.Doc {
    const holder = this.#holders.get(id);
    if (holder?.state !== "live" || readField<RecordKind>(holder.doc, "kind") !== kind) {
      throw new RecordNotFoundError(id);
    }
    return holder.doc;
  }

  #writeFields(doc: Y.Doc, values: Record<string, unknown>): void {
    const writer = { deviceId: this.#dependencies.deviceId, now: this.#now() };
    for (const [name, value] of Object.entries(values)) {
      if (value !== undefined) {
        writeField(doc, name, value, writer);
      }
    }
  }

  #writeNoteChanges(doc: Y.Doc, changes: NoteChanges): void {
    const { notebookIds, ...fields } = changes;
    const membership: Record<string, boolean> = {};
    if (notebookIds !== undefined) {
      // ノートブックごとに別の項目にする。1 つの配列だと、2 台で別のノートブックへ入れたときに片方が消える。
      for (const current of notebookIdsOf(doc)) {
        membership[NOTEBOOK_MEMBERSHIP_PREFIX + current] = false;
      }
      for (const notebookId of notebookIds) {
        membership[NOTEBOOK_MEMBERSHIP_PREFIX + notebookId] = true;
      }
      for (const name of Object.keys(membership)) {
        if ((readField<boolean>(doc, name) ?? false) === membership[name]) {
          delete membership[name];
        }
      }
    }
    this.#writeFields(doc, { ...fields, ...membership });
  }

  async #removeRecord(id: string, attachmentIds: string[]): Promise<void> {
    const holder = this.#holders.get(id);
    if (holder?.state === "live") {
      holder.doc.destroy();
    }
    const payload: RecordPayload = { kind: "removed", removedAt: this.#now().toISOString(), attachmentIds };
    this.#unsavedIds.delete(id);
    this.#hold(id, payload);
    const sealed = await sealRecordPayload(this.#dependencies.masterKey, id, payload);
    await this.#dependencies.writeQueue.run(async () => {
      const current = await this.#dependencies.localStore.getRecordEntry(id);
      await this.#putEntry({ id, sealed, remoteEtag: current?.remoteEtag ?? null, waitingForPush: true });
      await this.#deleteLocalBlobs(attachmentIds);
      await this.#versionHistory.forget(id);
    });
    this.#notify("local");
  }

  // 開いている文書の今の状態を暗号化して手元に書く。writeQueue の中から呼ぶ。
  // remoteEtag が undefined なら、手元の記録の ETag をそのまま保つ。
  async #persistLive(id: string, bookkeeping: { remoteEtag: string | null | undefined; waitingForPush?: boolean }): Promise<void> {
    const holder = this.#holders.get(id);
    if (holder?.state !== "live") {
      return;
    }
    const stored = await this.#dependencies.localStore.getRecordEntry(id);
    // ほかのウィンドウが先に書いていたら、その中身を取り込んでから書く（手元の保存から、相手の編集を消さない）。
    if (stored && !(await this.#mergeStoredEntry(stored))) {
      return;
    }
    if (holder.bodyEdited) {
      holder.bodyEdited = false;
      this.#writeFields(holder.doc, { editedAt: this.#now().toISOString() });
      if (stored) {
        await this.#versionHistory.captureBeforeEdit(id, stored.sealed);
      }
    }
    this.#unsavedIds.delete(id);
    const sealed = await sealRecordPayload(this.#dependencies.masterKey, id, { kind: "state", state: encodeRecordState(holder.doc) });
    const remoteEtag = bookkeeping.remoteEtag === undefined ? stored?.remoteEtag ?? null : bookkeeping.remoteEtag;
    await this.#putEntry({ id, sealed, remoteEtag, waitingForPush: bookkeeping.waitingForPush ?? true });
    // いま書いた暗号文は、この文書の中身そのもの。送信の記録だけを書き直すとき（confirmPushed など）は、手元の保存にある
    // 暗号文（ほかのウィンドウが書いたものかもしれない）をそのまま書くので、ここでは覚えない。覚えると、まだ取り込んでいない
    // 相手の中身を、取り込み済みと見なして飛ばしてしまう。
    holder.lastStoredSealed = sealed;
  }

  // 手元の保存に書いて、ほかのウィンドウへ知らせる。
  async #putEntry(entry: LocalRecordEntry): Promise<void> {
    await this.#dependencies.localStore.putRecordEntry(entry);
    this.#rememberWaitingForPush(entry);
    this.#dependencies.recordChangeChannel?.announce(entry.id);
  }

  #rememberWaitingForPush(entry: LocalRecordEntry): void {
    if (entry.waitingForPush) {
      this.#waitingForPushIds.add(entry.id);
    } else {
      this.#waitingForPushIds.delete(entry.id);
    }
  }

  async #markAttachmentsForUpload(attachments: AttachmentReference[]): Promise<void> {
    for (const attachment of attachments) {
      const blob = await this.#dependencies.localStore.getBlob(attachment.id);
      if (blob) {
        await this.#dependencies.localStore.putBlob({ ...blob, uploaded: false });
      }
    }
  }

  async #deleteLocalBlobs(ids: string[]): Promise<void> {
    for (const id of ids) {
      await this.#dependencies.localStore.deleteBlob(id);
    }
  }

  #views(): LiveRecord[] {
    const views: LiveRecord[] = [];
    for (const id of this.#holders.keys()) {
      const view = this.#view(id);
      if (view) {
        views.push(view);
      }
    }
    return views;
  }

  #view(id: string): LiveRecord | undefined {
    const holder = this.#holders.get(id);
    if (holder?.state !== "live") {
      return undefined;
    }
    holder.cachedView ??= buildView(id, holder);
    return holder.cachedView ?? undefined;
  }

  #cancelPersistTimer(): void {
    if (this.#persistTimer !== null) {
      clearTimeout(this.#persistTimer);
      this.#persistTimer = null;
    }
  }

  #now(): Date {
    return this.#dependencies.now?.() ?? new Date();
  }

  #notify(origin: RepositoryChangeOrigin): void {
    for (const listener of this.#listeners) {
      listener(origin);
    }
  }
}

// 履歴の版へ戻すときに書く項目。戻すのは、本文の中身を表すもの（タイトル）だけ。
// ノートブック・ピン留め・お気に入り・ゴミ箱・期限・テンプレート・本文の配置・プロパティの値は、整理と表示のための項目で、
// 履歴の画面には出ない。戻すと、利用者が見ていないところで変わるので、今のままにする。
// 今と同じ値は書かない。書くと、ほかのデバイスが同時に変えたタイトルを、古い値で上書きしてしまう（項目は新しく書いた方を取る）。
function restoredNoteChanges({ current, version }: { current: Y.Doc; version: Y.Doc }): NoteChanges {
  const changes: NoteChanges = {};
  const title = readField<string>(version, "title") ?? "";
  if (title !== (readField<string>(current, "title") ?? "")) {
    changes.title = title;
  }
  return changes;
}

function notebookIdsOf(doc: Y.Doc): string[] {
  return [...fieldNames(doc)]
    .filter((name) => name.startsWith(NOTEBOOK_MEMBERSHIP_PREFIX) && readField<boolean>(doc, name) === true)
    .map((name) => name.slice(NOTEBOOK_MEMBERSHIP_PREFIX.length));
}

function fieldsWithPrefix(doc: Y.Doc, prefix: string): Array<{ id: string; value: unknown }> {
  return [...fieldNames(doc)].filter((name) => name.startsWith(prefix)).map((name) => ({ id: name.slice(prefix.length), value: readField<unknown>(doc, name) }));
}

function propertyDefinitionsOf(doc: Y.Doc): PropertyDefinition[] {
  return fieldsWithPrefix(doc, PROPERTY_DEFINITION_FIELD_PREFIX)
    .map(({ id, value }) => propertyDefinitionFromField(id, value))
    .filter((definition) => definition !== null)
    .sort((left, right) => left.order - right.order || left.id.localeCompare(right.id));
}

function propertyValuesOf(doc: Y.Doc): Record<string, PropertyValue> {
  const values: Record<string, PropertyValue> = {};
  for (const { id, value } of fieldsWithPrefix(doc, PROPERTY_VALUE_FIELD_PREFIX)) {
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      values[id] = value;
    }
  }
  return values;
}

function buildView(id: string, holder: LiveHolder): LiveRecord | null {
  const { doc, revision } = holder;
  const header = { id, updatedAt: latestFieldTime(doc), revision };
  const createdAt = readField<string>(doc, "createdAt") ?? header.updatedAt;
  const kind = readField<RecordKind>(doc, "kind");
  if (kind === "notebook") {
    return {
      ...header,
      kind,
      content: {
        name: readField<string>(doc, "name") ?? "",
        parentId: readField<string | null>(doc, "parentId") ?? null,
        colorName: readField<string | null>(doc, "colorName") ?? null,
        iconName: readField<string | null>(doc, "iconName") ?? null,
        properties: propertyDefinitionsOf(doc),
        databaseView: databaseViewFromField(readField<unknown>(doc, "databaseView")),
        createdAt,
      },
    };
  }
  if (kind === "savedSearch") {
    return {
      ...header,
      kind,
      content: {
        name: readField<string>(doc, "name") ?? "",
        searchText: readField<string>(doc, "searchText") ?? "",
        notebookId: readField<string | null>(doc, "notebookId") ?? null,
        tag: readField<string | null>(doc, "tag") ?? null,
        createdAt,
      },
    };
  }
  if (kind !== "note") {
    return null;
  }
  const body = recordBody(doc);
  return {
    ...header,
    kind,
    body,
    content: {
      title: readField<string>(doc, "title") ?? "",
      notebookIds: notebookIdsOf(doc),
      pinned: readField<boolean>(doc, "pinned") ?? false,
      bookmarked: readField<boolean>(doc, "bookmarked") ?? false,
      trashedAt: readField<string | null>(doc, "trashedAt") ?? null,
      isTemplate: readField<boolean>(doc, "isTemplate") ?? false,
      dueAt: dueAtOf(doc),
      pageAlignment: pageAlignmentOf(doc),
      attachments: bodyAttachments(body),
      propertyValues: propertyValuesOf(doc),
      createdAt,
    },
  };
}

// 読めない形（新しい版のアプリが足したもの）は、期限なしとして読む。
function dueAtOf(doc: Y.Doc): string | null {
  const stored = readField<unknown>(doc, "dueAt");
  return isDueTime(stored) ? stored : null;
}

function pageAlignmentOf(doc: Y.Doc): PageAlignment | null {
  const stored = readField<unknown>(doc, "pageAlignment");
  return PAGE_ALIGNMENTS.find((alignment) => alignment === stored) ?? null;
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.length === right.length && left.every((byte, index) => byte === right[index]);
}
