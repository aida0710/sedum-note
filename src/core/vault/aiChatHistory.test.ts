import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { newRandomId } from "../crypto/randomId";
import { importAesKey, seal } from "../crypto/sealedBox";
import { IndexedDbLocalStore } from "../local/indexedDbLocalStore";
import { readSavedAiChats, type SavedAiChat, writeSavedAiChats } from "./aiChatHistory";

const MASTER_KEY_BYTES = 32;

async function newStore() {
  return { localStore: new IndexedDbLocalStore(`test-${newRandomId()}`), masterKey: await importAesKey(crypto.getRandomValues(new Uint8Array(MASTER_KEY_BYTES)), false) };
}

const chat = (id: string, updatedAt: string): SavedAiChat<string> => ({ id, title: id, createdAt: updatedAt, updatedAt, messages: ["こんにちは"] });

describe("残した AI の会話", () => {
  it("新しく話した順に残し、読み戻せる", async () => {
    const { localStore, masterKey } = await newStore();
    await writeSavedAiChats(localStore, masterKey, [chat("old", "2026-11-01T00:00:00Z"), chat("new", "2026-11-13T00:00:00Z")]);
    expect((await readSavedAiChats<string>(localStore, masterKey)).map((saved) => saved.id)).toEqual(["new", "old"]);
  });

  it("版を書いていない前の形（会話の配列だけ）で残した会話は、読み込むときに捨てる", async () => {
    const { localStore, masterKey } = await newStore();
    const previousFormat = new TextEncoder().encode(JSON.stringify([chat("previous", "2026-11-01T00:00:00Z")]));
    await localStore.writeSetting("sealedAiChats", await seal(masterKey, previousFormat, "settings:aiChats"));
    expect(await readSavedAiChats<string>(localStore, masterKey)).toEqual([]);
  });
});
