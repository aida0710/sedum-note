// メモリの中の ObjectStore。単体試験で、2 台のデバイスが 1 つの同期先を
// 取り合う様子を作るのに使う。条件付き PUT の振る舞いは S3 と同じにする。

import {
  type ObjectStore,
  type ObjectSummary,
  PreconditionFailedError,
  type StoredObject,
  type WriteCondition,
} from "./objectStore";

export class MemoryObjectStore implements ObjectStore {
  readonly #objects = new Map<string, StoredObject>();
  #nextEtag = 1;

  async list(prefix: string): Promise<ObjectSummary[]> {
    return [...this.#objects]
      .filter(([key]) => key.startsWith(prefix))
      .map(([key, object]) => ({ key, etag: object.etag }));
  }

  async get(key: string): Promise<StoredObject | null> {
    const object = this.#objects.get(key);
    return object ? { body: object.body.slice(), etag: object.etag } : null;
  }

  async put(key: string, body: Uint8Array, condition: WriteCondition): Promise<{ etag: string }> {
    const current = this.#objects.get(key);
    const allowed = "ifMatch" in condition ? current?.etag === condition.ifMatch : current === undefined;
    if (!allowed) {
      throw new PreconditionFailedError(key);
    }
    const etag = `etag-${this.#nextEtag++}`;
    this.#objects.set(key, { body: body.slice(), etag });
    return { etag };
  }

  // 試験で、S3 に置かれた暗号文を直接書き換える（管理者による改ざん）ために使う。
  replaceBodyForTest(key: string, body: Uint8Array): void {
    const current = this.#objects.get(key);
    if (!current) {
      throw new Error(`no object at ${key}`);
    }
    this.#objects.set(key, { body, etag: `etag-${this.#nextEtag++}` });
  }
}
