import { describe, expect, it } from "vitest";
import type { LiveNote, NoteRecord, NotebookRecord } from "../notes/noteRecords";
import { resolveConflict } from "./conflictResolution";

const factory = { newId: () => "c".repeat(32), copyTitle: (title: string) => `${title}（競合コピー）` };

function note(overrides: Partial<LiveNote["content"]>, updatedAt = "2026-11-10T00:00:00.000Z"): LiveNote {
  return {
    id: "a".repeat(32), kind: "note", updatedAt, updatedBy: "d", removed: false,
    content: { title: "メモ", document: { text: "本文" }, notebookIds: [], pinned: false, bookmarked: false, trashedAt: null, attachments: [], createdAt: "2026-11-01T00:00:00.000Z", ...overrides },
  };
}

const removedNote: NoteRecord = { id: "a".repeat(32), kind: "note", updatedAt: "2026-11-10T00:00:00.000Z", updatedBy: "d", removed: true, content: null };

describe("resolveConflict", () => {
  it("両方で本文を変えたら、同期先を残して手元を競合コピーにする", () => {
    const outcome = resolveConflict(note({ document: { text: "手元" } }), note({ document: { text: "同期先" } }), factory);
    expect(outcome.kind).toBe("accept_remote_and_add_copy");
    if (outcome.kind === "accept_remote_and_add_copy" && !outcome.copy.removed) {
      expect(outcome.copy.id).toBe("c".repeat(32));
      expect(outcome.copy.content.title).toBe("メモ（競合コピー）");
      expect(outcome.copy.content.document).toEqual({ text: "手元" });
    }
  });

  it("手元で削除し、同期先で編集されていたら、編集を残す", () => {
    expect(resolveConflict(removedNote, note({ title: "編集した" }), factory).kind).toBe("accept_remote");
  });

  it("同期先で削除され、手元で編集していたら、手元を送り直す", () => {
    expect(resolveConflict(note({ title: "編集した" }), removedNote, factory).kind).toBe("push_local");
  });

  it("ピン留めだけの違いなら、新しい方を残して競合コピーは作らない", () => {
    const local = note({ pinned: true }, "2026-11-10T00:00:02.000Z");
    const remote = note({ bookmarked: true }, "2026-11-10T00:00:01.000Z");
    expect(resolveConflict(local, remote, factory).kind).toBe("push_local");
  });

  it("ノートブックの名前は新しい方を残す", () => {
    const notebook = (name: string, updatedAt: string): NotebookRecord => ({
      id: "b".repeat(32), kind: "notebook", updatedAt, updatedBy: "d", removed: false, content: { name, parentId: null, createdAt: updatedAt },
    });
    const outcome = resolveConflict(notebook("仕事", "2026-11-10T00:00:01.000Z"), notebook("しごと", "2026-11-10T00:00:05.000Z"), factory);
    expect(outcome.kind).toBe("accept_remote");
  });
});
