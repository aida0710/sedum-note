// 新しいバージョンがあるかを確かめる。
//
// デスクトップのアプリは、Tauri の更新のプラグインで確かめる。あれば、その場でダウンロードして
// 入れ替えられる（署名を確かめてから入れる）。Android と Web 版と、プラグインで見つからなかったときは、
// GitHub のリリースの一覧で確かめ、あればリリースのページを開けるようにする。
//
// どちらも、送るのはアプリの今のバージョンと OS の種類だけで、メモの中身や vault の情報は送らない。

import { relaunch } from "@tauri-apps/plugin-process";
import { check } from "@tauri-apps/plugin-updater";
import { isRunningInTauri } from "../platform/runtime";
import { APP_VERSION } from "./appVersion";
import { compareVersions } from "./compareVersions";

const LATEST_RELEASE_API_URL = "https://api.github.com/repos/aida0710/sedum-note/releases/latest";
// リリースのページとして開いてよい URL の先頭。API の応答に別の URL が入っていても開かない。
const RELEASE_PAGE_URL_PREFIX = "https://github.com/aida0710/sedum-note/releases/";

export type AvailableUpdate = {
  version: string;
  // その場で入れ替えて再起動する。アプリが自分を更新できない環境では null。
  installAndRelaunch: (() => Promise<void>) | null;
  releasePageUrl: string;
};

// failed は、回線が無い・GitHub が断った（回数の制限など）・答えが読めないなどで、新しいバージョンがあるかが分からなかったこと。
export type UpdateCheckResult =
  | { kind: "available"; update: AvailableUpdate }
  | { kind: "upToDate" }
  | { kind: "failed" };

const UP_TO_DATE: UpdateCheckResult = { kind: "upToDate" };
const FAILED: UpdateCheckResult = { kind: "failed" };

export async function checkForUpdate(): Promise<UpdateCheckResult> {
  const selfUpdate = isRunningInTauri() ? await checkSelfUpdate() : null;
  if (selfUpdate?.kind === "available") {
    return selfUpdate;
  }
  const latestRelease = await checkLatestRelease();
  // GitHub に聞けなくても、更新のプラグインが新しいものは無いと答えていれば、最新とみなす。
  return latestRelease.kind === "failed" && selfUpdate?.kind === "upToDate" ? selfUpdate : latestRelease;
}

// 更新のプラグインが無い（Android）・この入れ方の更新が置かれていない・回線が無いときは failed。
async function checkSelfUpdate(): Promise<UpdateCheckResult> {
  try {
    const update = await check();
    if (update === null) {
      return UP_TO_DATE;
    }
    return {
      kind: "available",
      update: {
        version: update.version,
        releasePageUrl: `${RELEASE_PAGE_URL_PREFIX}tag/v${update.version}`,
        installAndRelaunch: async () => {
          await update.downloadAndInstall();
          await relaunch();
        },
      },
    };
  } catch {
    return FAILED;
  }
}

async function checkLatestRelease(): Promise<UpdateCheckResult> {
  try {
    const response = await fetch(LATEST_RELEASE_API_URL, { headers: { Accept: "application/vnd.github+json" } });
    if (!response.ok) {
      return FAILED;
    }
    const release = (await response.json()) as { tag_name?: unknown; html_url?: unknown };
    if (typeof release.tag_name !== "string" || typeof release.html_url !== "string" || !release.html_url.startsWith(RELEASE_PAGE_URL_PREFIX)) {
      return FAILED;
    }
    if (compareVersions(release.tag_name, APP_VERSION) <= 0) {
      return UP_TO_DATE;
    }
    return { kind: "available", update: { version: release.tag_name.replace(/^v/, ""), releasePageUrl: release.html_url, installAndRelaunch: null } };
  } catch {
    return FAILED;
  }
}
