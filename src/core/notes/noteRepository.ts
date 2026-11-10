// ロック解除中のメモとノートブック。手元の暗号文を開いてメモリに持ち、
// 変更は暗号化して手元に書き、「送っていない」の印を付ける（送るのは SyncEngine）。

import { newRandomId } from "../crypto/randomId";
import { open, seal } from "../crypto/sealedBox";
import type { LocalStore } from "../local/localStore";
import type { SerialQueue } from "../local/serialQueue";
import { blobBinding } from "../sync/remoteLayout";
import type {
  AttachmentReference,
  LiveNote,
  LiveNotebook,
  NoteContent,
  NotebookContent,
  SyncedRecord,
} from "./noteRecords";
import { openRecord, sealRecord } from "./recordCodec";

export type NoteRepositoryDependencies = {
  localStore: LocalStore;
  masterKey: CryptoKey;
  deviceId: string;
  writeQueue: SerialQueue;
  // 手元に無い添付を同期先から取る。同期先を設定していなければ null を返す。
  downloadBlob: (id: string) => Promise<Uint8Array | null>;
  now?: () => Date;
};

export type NoteChanges = Partial<Omit<NoteContent, "createdAt">>;

export class RecordNotFoundError extends Error {
  constructor(id: string) {
    super(`no record ${id}`);
    this.name = "RecordNotFoundError";
  }
}

export class NoteRepository {
  readonly #dependencies: NoteRepositoryDependencies;
  readonly #records = new Map<string, SyncedRecord>();
  readonly #listeners = new Set<() => void>();
  #unreadableIds: string[] = [];

  constructor(dependencies: NoteRepositoryDependencies) {
    this.#dependencies = dependencies;
  }

  async load(): Promise<void> {
    this.#records.clear();
    this.#unreadableIds = [];
    for (const entry of await this.#dependencies.localStore.listRecordEntries()) {
      await this.#openIntoMemory(entry.id, entry.sealed);
    }
    this.#notify();
  }

  // 同期で取り込んだ記録を開き直す。
  async reloadRecords(ids: string[]): Promise<void> {
    for (const id of ids) {
      const entry = await this.#dependencies.localStore.getRecordEntry(id);
      if (entry) {
        await this.#openIntoMemory(id, entry.sealed);
      }
    }
    this.#notify();
  }

  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  notes(): LiveNote[] {
    return [...this.#records.values()].filter((record): record is LiveNote => record.kind === "note" && !record.removed);
  }

  notebooks(): LiveNotebook[] {
    return [...this.#records.values()].filter(
      (record): record is LiveNotebook => record.kind === "notebook" && !record.removed,
    );
  }

  unreadableIds(): string[] {
    return [...this.#unreadableIds];
  }

  note(id: string): LiveNote | undefined {
    const record = this.#records.get(id);
    return record?.kind === "note" && !record.removed ? record : undefined;
  }

  async createNote(initial: Partial<Omit<NoteContent, "createdAt">> = {}): Promise<LiveNote> {
    const createdAt = this.#now();
    const content: NoteContent = {
      title: "",
      document: null,
      notebookIds: [],
      pinned: false,
      bookmarked: false,
      trashedAt: null,
      attachments: [],
      ...initial,
      createdAt,
    };
    const note: LiveNote = { id: newRandomId(), kind: "note", updatedAt: createdAt, updatedBy: this.#dependencies.deviceId, removed: false, content };
    await this.#write(note);
    return note;
  }

  async updateNote(id: string, changes: NoteChanges): Promise<LiveNote> {
    const current = this.note(id);
    if (!current) {
      throw new RecordNotFoundError(id);
    }
    const updated: LiveNote = { ...current, ...this.#stamp(), content: { ...current.content, ...changes } };
    await this.#write(updated);
    return updated;
  }

  async moveNoteToTrash(id: string): Promise<void> {
    await this.updateNote(id, { trashedAt: this.#now(), pinned: false });
  }

  async restoreNoteFromTrash(id: string): Promise<void> {
    await this.updateNote(id, { trashedAt: null });
  }

  // 完全に削除する。ほかのデバイスに伝えるため、中身を空にした記録を残す。
  async removeNotePermanently(id: string): Promise<void> {
    const current = this.note(id);
    if (!current) {
      throw new RecordNotFoundError(id);
    }
    await this.#write({ id, kind: "note", ...this.#stamp(), removed: true, content: null });
  }

  async createNotebook(name: string, parentId: string | null = null): Promise<LiveNotebook> {
    const createdAt = this.#now();
    const content: NotebookContent = { name, parentId, createdAt };
    const notebook: LiveNotebook = { id: newRandomId(), kind: "notebook", updatedAt: createdAt, updatedBy: this.#dependencies.deviceId, removed: false, content };
    await this.#write(notebook);
    return notebook;
  }

  async updateNotebook(id: string, changes: Partial<Omit<NotebookContent, "createdAt">>): Promise<LiveNotebook> {
    const current = this.#records.get(id);
    if (current?.kind !== "notebook" || current.removed) {
      throw new RecordNotFoundError(id);
    }
    const updated: LiveNotebook = { ...current, ...this.#stamp(), content: { ...current.content, ...changes } };
    await this.#write(updated);
    return updated;
  }

  // ノートブックを消す。中のメモは消さず、そのノートブックから外すだけにする。
  async removeNotebook(id: string): Promise<void> {
    const current = this.#records.get(id);
    if (current?.kind !== "notebook" || current.removed) {
      throw new RecordNotFoundError(id);
    }
    for (const note of this.notes().filter((candidate) => candidate.content.notebookIds.includes(id))) {
      await this.updateNote(note.id, { notebookIds: note.content.notebookIds.filter((notebookId) => notebookId !== id) });
    }
    for (const child of this.notebooks().filter((candidate) => candidate.content.parentId === id)) {
      await this.updateNotebook(child.id, { parentId: current.content.parentId });
    }
    await this.#write({ id, kind: "notebook", ...this.#stamp(), removed: true, content: null });
  }

  // 写真などを暗号化して手元に置く。メモへの参照は呼び出し側が updateNote で足す。
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

  async #write(record: SyncedRecord): Promise<void> {
    const { localStore, masterKey, writeQueue } = this.#dependencies;
    const sealed = await sealRecord(masterKey, record);
    await writeQueue.run(async () => {
      const current = await localStore.getRecordEntry(record.id);
      await localStore.putRecordEntry({ id: record.id, sealed, remoteEtag: current?.remoteEtag ?? null, waitingForPush: true });
    });
    this.#records.set(record.id, record);
    this.#notify();
  }

  async #openIntoMemory(id: string, sealed: Uint8Array): Promise<void> {
    try {
      this.#records.set(id, await openRecord(this.#dependencies.masterKey, id, sealed));
      this.#unreadableIds = this.#unreadableIds.filter((unreadableId) => unreadableId !== id);
    } catch {
      if (!this.#unreadableIds.includes(id)) {
        this.#unreadableIds.push(id);
      }
    }
  }

  #stamp(): { updatedAt: string; updatedBy: string } {
    return { updatedAt: this.#now(), updatedBy: this.#dependencies.deviceId };
  }

  #now(): string {
    return (this.#dependencies.now?.() ?? new Date()).toISOString();
  }

  #notify(): void {
    for (const listener of this.#listeners) {
      listener();
    }
  }
}
