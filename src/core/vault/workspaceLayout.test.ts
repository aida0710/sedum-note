import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { newRandomId } from "../crypto/randomId";
import { importAesKey } from "../crypto/sealedBox";
import { IndexedDbLocalStore } from "../local/indexedDbLocalStore";
import { readWorkspaceLayout, type WorkspaceLayout, writeWorkspaceLayout } from "./workspaceLayout";

const MASTER_KEY_BYTES = 32;
const NOTE_ID = "0123456789abcdef";

async function newStore() {
  return { localStore: new IndexedDbLocalStore(`test-${newRandomId()}`), masterKey: await importAesKey(crypto.getRandomValues(new Uint8Array(MASTER_KEY_BYTES)), false) };
}

describe("PC の画面の並びの保存", () => {
  it("まだ残していなければ null を返す", async () => {
    const { localStore, masterKey } = await newStore();
    expect(await readWorkspaceLayout(localStore, masterKey)).toBeNull();
  });

  it("残した並びを読み戻せ、手元にはメモの ID が平文で残らない", async () => {
    const { localStore, masterKey } = await newStore();
    const layout: WorkspaceLayout = { openTabs: [NOTE_ID, "settings"], pinnedTabs: [NOTE_ID], activeTab: "settings", settingsPage: "sync", expandedRows: { trash: true } };
    await writeWorkspaceLayout(localStore, masterKey, layout);
    expect(await readWorkspaceLayout(localStore, masterKey)).toEqual(layout);
    const stored = await localStore.readSetting<Uint8Array>("sealedWorkspaceLayout");
    expect(new TextDecoder().decode(stored)).not.toContain(NOTE_ID);
  });
});
