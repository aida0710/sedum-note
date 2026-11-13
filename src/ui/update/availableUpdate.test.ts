import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkForUpdate } from "./availableUpdate";
import { APP_VERSION } from "./appVersion";

const platform = vi.hoisted(() => ({ inTauri: true }));
const updater = vi.hoisted(() => ({ check: vi.fn() }));

vi.mock("../platform/runtime", () => ({ isRunningInTauri: () => platform.inTauri }));
vi.mock("@tauri-apps/plugin-updater", () => ({ check: updater.check }));
vi.mock("@tauri-apps/plugin-process", () => ({ relaunch: vi.fn() }));

const RELEASE_PAGE = "https://github.com/aida0710/sedum-note/releases/tag/v99.0.0";
const NEWER = "99.0.0";

// GitHub のリリースの一覧（releases/latest）の答え。null なら回線が無いときのように失敗させる。
function answerLatestRelease(release: { tag_name: string; html_url: string } | null, status = 200) {
  const fetch = vi.fn(async () => {
    if (release === null) {
      throw new TypeError("Failed to fetch");
    }
    return new Response(JSON.stringify(release), { status });
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

const pluginFindsUpdate = () => updater.check.mockResolvedValue({ version: NEWER, downloadAndInstall: vi.fn() });
const pluginFindsNothing = () => updater.check.mockResolvedValue(null);
// Android など、更新のプラグインが使えない環境と、回線が無いとき。
const pluginFails = () => updater.check.mockRejectedValue(new Error("updater unavailable"));

describe("新しいバージョンがあるかを確かめる", () => {
  beforeEach(() => {
    platform.inTauri = true;
    updater.check.mockReset();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("更新のプラグインが見つけたら、その場で入れ替えられる更新として返し、GitHub の一覧には聞かない", async () => {
    pluginFindsUpdate();
    const fetch = answerLatestRelease(null);

    const result = await checkForUpdate();

    expect(result.kind === "available" && result.update.version).toBe(NEWER);
    expect(result.kind === "available" && result.update.installAndRelaunch).not.toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("プラグインが使えなくても、GitHub の一覧に新しいリリースがあれば、リリースのページを開ける更新として返す", async () => {
    pluginFails();
    answerLatestRelease({ tag_name: `v${NEWER}`, html_url: RELEASE_PAGE });

    expect(await checkForUpdate()).toEqual({ kind: "available", update: { version: NEWER, releasePageUrl: RELEASE_PAGE, installAndRelaunch: null } });
  });

  it("GitHub の一覧のいちばん新しいリリースが今のバージョンなら、最新と答える", async () => {
    pluginFails();
    answerLatestRelease({ tag_name: `v${APP_VERSION}`, html_url: `https://github.com/aida0710/sedum-note/releases/tag/v${APP_VERSION}` });

    expect(await checkForUpdate()).toEqual({ kind: "upToDate" });
  });

  it("GitHub に聞けなくても、プラグインが新しいものは無いと答えていれば、最新と答える", async () => {
    pluginFindsNothing();
    answerLatestRelease(null);

    expect(await checkForUpdate()).toEqual({ kind: "upToDate" });
  });

  it("プラグインも GitHub も答えなければ、最新とは言わずに、確かめられなかったと答える", async () => {
    pluginFails();
    answerLatestRelease(null);

    expect(await checkForUpdate()).toEqual({ kind: "failed" });
  });

  it("GitHub が断った（回数の制限など）ときと、リリースのページがこのアプリの外を指すときも、確かめられなかったと答える", async () => {
    pluginFails();
    answerLatestRelease({ tag_name: `v${NEWER}`, html_url: RELEASE_PAGE }, 403);
    expect(await checkForUpdate()).toEqual({ kind: "failed" });

    answerLatestRelease({ tag_name: `v${NEWER}`, html_url: "https://example.com/sedum-note" });
    expect(await checkForUpdate()).toEqual({ kind: "failed" });
  });

  it("Web 版は、プラグインを使わずに GitHub の一覧だけで確かめる", async () => {
    platform.inTauri = false;
    answerLatestRelease({ tag_name: `v${NEWER}`, html_url: RELEASE_PAGE });

    expect((await checkForUpdate()).kind).toBe("available");
    expect(updater.check).not.toHaveBeenCalled();
  });
});
