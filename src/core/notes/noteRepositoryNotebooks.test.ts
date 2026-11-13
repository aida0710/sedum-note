import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { newTestRepository } from "./repositoryFixtures";

describe("ノートブックの移動", () => {
  it("別のノートブックの中へ移し、一番上の段へ戻せる。自分の中（自分と、その下のノートブック）へは移せない", async () => {
    const { repository } = await newTestRepository();
    const work = await repository.createNotebook("仕事");
    const minutes = await repository.createNotebook("議事録", work.id);
    const travel = await repository.createNotebook("旅行");
    const parentOf = (id: string) => repository.notebooks().find((notebook) => notebook.id === id)?.content.parentId;

    await repository.moveNotebook(travel.id, minutes.id);
    expect(parentOf(travel.id)).toBe(minutes.id);
    await expect(repository.moveNotebook(work.id, travel.id)).rejects.toThrow("cannot be moved into itself");
    await expect(repository.moveNotebook(work.id, work.id)).rejects.toThrow("cannot be moved into itself");
    expect(parentOf(work.id)).toBeNull();

    await repository.moveNotebook(travel.id, null);
    expect(parentOf(travel.id)).toBeNull();
  });
});
