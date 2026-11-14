import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { newRandomId } from "../../core/crypto/randomId";
import { open, seal } from "../../core/crypto/sealedBox";
import type { VaultKey } from "../../core/vault/vaultSession";
import { createAppWindowsKeyTransport } from "../platform/appWindowsKeyTransport";
import { createKeyHandoff } from "./keyHandoffOfThisApp";
import { UnlockedKeyHandoff } from "./unlockedKeyHandoff";

// 解除している印（Web Locks）は Node に無いので、試験ごとに「ある・無い」を決める。
const presence = vi.hoisted(() => ({ unlockedElsewhere: true }));
vi.mock("../platform/unlockedPresence", () => ({
  isUnlockedInAnotherWindow: async () => presence.unlockedElsewhere,
  holdUnlockedPresence: () => () => undefined,
}));

// アプリ（Tauri）が使う BroadcastChannel の名前（platform/appWindowsKeyTransport.ts）。
const APP_KEY_CHANNEL_NAME = "sedum-note:unlocked-keys";

// ブラウザ（アプリの WebView）と同じく、送ったものを、同じ名前のほかの通り道の全部へ、受け手ごとに構造化複製して届ける
// BroadcastChannel。Node の BroadcastChannel は、CryptoKey を 2 つ以上の受け手へ送れない（「Message could not be posted」）ので差し替える。
// 試験のあとに全部閉じて、前の試験のウィンドウが答えないようにする。
class BrowserLikeBroadcastChannel extends EventTarget {
  static readonly opened = new Set<BrowserLikeBroadcastChannel>();

  constructor(readonly name: string) {
    super();
    BrowserLikeBroadcastChannel.opened.add(this);
  }

  postMessage(message: unknown): void {
    for (const other of BrowserLikeBroadcastChannel.opened) {
      if (other !== this && other.name === this.name) {
        const data: unknown = structuredClone(message);
        setTimeout(() => other.dispatchEvent(new MessageEvent("message", { data })));
      }
    }
  }

  close(): void {
    BrowserLikeBroadcastChannel.opened.delete(this);
  }
}
// 返事の来ない試験で待つ長さ。製品の上限（2 秒）を待たずに済ませる。
const SHORT_REPLY_TIMEOUT_MS = 100;

async function newVaultKey(): Promise<VaultKey> {
  const masterKey = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  return { vaultId: newRandomId(), masterKey };
}

// ロックを解除しているアプリのウィンドウ。keys は、そのウィンドウで解除しているスペースのキー。
function unlockedAppWindow(keys: Map<string, VaultKey>) {
  const handoff = new UnlockedKeyHandoff({ transport: createAppWindowsKeyTransport(), isUnlockedElsewhere: async () => false, keyOf: (spaceId) => keys.get(spaceId) ?? null });
  return { handoff, stopAnswering: handoff.answerRequests() };
}

// 通り道に流れた知らせを、全部覚えておく（同じ出どころの、関係の無いページが聞いているのを模す）。
function listenToAppKeyChannel(): { heard: unknown[]; close: () => void } {
  const channel = new BroadcastChannel(APP_KEY_CHANNEL_NAME);
  const heard: unknown[] = [];
  channel.addEventListener("message", (event: MessageEvent<unknown>) => heard.push(event.data));
  return { heard, close: () => channel.close() };
}

const nextMessages = () => new Promise((resolve) => setTimeout(resolve, SHORT_REPLY_TIMEOUT_MS));

beforeEach(() => {
  vi.stubGlobal("BroadcastChannel", BrowserLikeBroadcastChannel);
});

afterEach(() => {
  presence.unlockedElsewhere = true;
  BrowserLikeBroadcastChannel.opened.clear();
  vi.unstubAllGlobals();
});

describe("アプリ（Tauri）のウィンドウの間のキーの受け渡し", () => {
  it("解除しているウィンドウがあれば、新しいウィンドウはキーを頼んで、取り出せないまま受け取る。受け取ったキーで、相手の暗号文を開ける", async () => {
    const key = await newVaultKey();
    const unlocked = unlockedAppWindow(new Map([["space-a", key]]));
    const newWindow = createKeyHandoff({ runningInTauri: true });

    const received = await newWindow.requestKey("space-a");
    unlocked.stopAnswering();

    expect(received?.vaultId).toBe(key.vaultId);
    expect(received?.masterKey.extractable).toBe(false);
    const sealed = await seal(key.masterKey, new TextEncoder().encode("メモ"), "binding");
    expect(new TextDecoder().decode(await open(received!.masterKey, sealed, "binding"))).toBe("メモ");
  });

  it("解除している印が無ければ、頼まずに、待たずに null を返す", async () => {
    presence.unlockedElsewhere = false;
    const spy = listenToAppKeyChannel();
    const newWindow = createKeyHandoff({ runningInTauri: true });

    expect(await newWindow.requestKey("space-a")).toBeNull();
    await nextMessages();
    spy.close();
    expect(spy.heard).toEqual([]);
  });

  it("頼まれたスペースのキーを持つウィンドウが無ければ、返事は来ず、待ちの上限で null を返す", async () => {
    const unlocked = unlockedAppWindow(new Map([["space-a", await newVaultKey()]]));
    const newWindow = new UnlockedKeyHandoff({
      transport: createAppWindowsKeyTransport(), isUnlockedElsewhere: async () => true, keyOf: () => null, replyTimeoutMs: SHORT_REPLY_TIMEOUT_MS,
    });

    expect(await newWindow.requestKey("space-b")).toBeNull();
    unlocked.stopAnswering();
  });

  it("ロックの画面のウィンドウは、ほかのウィンドウで解除したと知らせを受けたら、そのウィンドウにキーを頼んで受け取る", async () => {
    const keysOfUnlockingWindow = new Map<string, VaultKey>();
    const unlocking = unlockedAppWindow(keysOfUnlockingWindow);
    const lockedWindow = createKeyHandoff({ runningInTauri: true });
    const received = new Promise<VaultKey | null>((resolve) => {
      lockedWindow.onUnlockedElsewhere("space-a", (requestKey) => void requestKey().then(resolve));
    });

    const key = await newVaultKey();
    keysOfUnlockingWindow.set("space-a", key);
    unlocking.handoff.announceUnlocked("space-a");

    expect((await received)?.vaultId).toBe(key.vaultId);
    unlocking.stopAnswering();
  });

  it("「解除した」の知らせには、キーを入れない", async () => {
    const spy = listenToAppKeyChannel();
    createKeyHandoff({ runningInTauri: true }).announceUnlocked("space-a");
    await nextMessages();
    spy.close();
    expect(spy.heard).toEqual([expect.objectContaining({ kind: "unlocked", spaceId: "space-a" })]);
    expect(spy.heard[0]).not.toHaveProperty("key");
  });
});

describe("Web 版のキーの受け渡し", () => {
  it("BroadcastChannel には何も流さず、BroadcastChannel で頼まれても答えない（同じ出どころのほかのページに届くため）", async () => {
    // このアプリが開いたのではない、ふつうのタブ（opener が無い）。
    const messageListeners: unknown[] = [];
    vi.stubGlobal("window", {
      location: { search: "", origin: "https://example.github.io", pathname: "/sedum-note/" },
      opener: null,
      addEventListener: (_type: string, listener: unknown) => messageListeners.push(listener),
      removeEventListener: () => undefined,
    });
    const spy = listenToAppKeyChannel();
    const webWindow = createKeyHandoff({ runningInTauri: false });
    const stopAnswering = webWindow.answerRequests();

    webWindow.announceUnlocked("space-a");
    const asker = new BroadcastChannel(APP_KEY_CHANNEL_NAME);
    asker.postMessage({ app: "sedum-note:unlocked-key", kind: "keyRequest", spaceId: "space-a", requestId: newRandomId() });
    expect(await webWindow.requestKey("space-a")).toBeNull();
    await nextMessages();
    asker.close();
    spy.close();
    stopAnswering();

    // 聞こえたのは、上で自分が送った頼みだけ（Web 版の受け渡しは、何も流していない）。
    expect(spy.heard).toEqual([expect.objectContaining({ kind: "keyRequest" })]);
    expect(messageListeners).toHaveLength(1);
  });
});
