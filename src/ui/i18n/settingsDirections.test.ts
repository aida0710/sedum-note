// 「設定」へ行くように言う文言（「設定」で〜してください、など）に、行き先のボタンが付いているかを見る。
// 案内だけで終わる画面には行き先へのボタンを添える、という決まり（2026-11-13 の利用者の指摘）を、文言を足したときに忘れないため。
// 新しくこの形の文言を足すと、下の一覧に無いので落ちる。ボタンを付けて "button" にするか、要らない理由を書いて "no-button" にする。

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { japaneseMessages, type MessageKey } from "./messages.ja";

// 「「設定」で」「設定で〜」「設定の「AI」」のように、アプリの設定へ行くように言う形。
// 「このデバイスだけの設定です」と、OS・ブラウザの設定（「端末の設定で」）は当たらないようにする。
const SETTINGS_DIRECTION = /「設定」|(?<!の)設定で(?!す)|設定の「/;

type Direction =
  // 文言を出す部品（shownIn。リポジトリの根からのパス）に、設定を開くボタンか、押すと設定を開く所がある。
  | { kind: "button"; shownIn: string[] }
  // ボタンが要らない、または置けない。
  | { kind: "no-button"; reason: string };

const DIRECTIONS: Partial<Record<MessageKey, Direction>> = {
  "setup.useSyncHint": { kind: "no-button", reason: "最初の画面。設定はメモを作ったあとに開くので、ここからは行けない" },
  "syncSetup.importHint": { kind: "no-button", reason: "ほかのデバイスの設定のこと" },
  "syncSetup.notSyncSetup": { kind: "no-button", reason: "ほかのデバイスの設定のこと" },
  "syncKey.generatedDescription": { kind: "no-button", reason: "失くしたときの案内で、今は行かなくてよい" },
  "error.storage.etag_hidden": { kind: "no-button", reason: "バケットの CORS の設定（アプリの外）のこと" },
  // 同期の失敗は、設定の「同期」のページの中と、左下の同期の状態（押すと同期のページ）、スマホの引いて同期の知らせに出る。
  "error.outdatedSyncTarget": { kind: "button", shownIn: ["src/ui/workspace/SyncStatusLine.tsx", "src/ui/mobile/useSyncFromPull.ts"] },
  "error.vaultNotFound": { kind: "button", shownIn: ["src/ui/workspace/SyncStatusLine.tsx", "src/ui/mobile/useSyncFromPull.ts"] },
  "error.vaultReplaced": { kind: "button", shownIn: ["src/ui/workspace/SyncStatusLine.tsx", "src/ui/mobile/useSyncFromPull.ts"] },
  "ai.notEnabled": { kind: "button", shownIn: ["src/ui/ai/AiChat.tsx"] },
  "ai.error.authentication": { kind: "button", shownIn: ["src/ui/ai/AiChat.tsx"] },
  "ai.error.modelNotFound": { kind: "button", shownIn: ["src/ui/ai/AiChat.tsx"] },
  "ai.tool.status.denied": { kind: "button", shownIn: ["src/ui/ai/AiToolActivityLine.tsx"] },
  "about.noWarranty": { kind: "button", shownIn: ["src/ui/about/AboutSection.tsx"] },
  "dataHandling.storage": { kind: "no-button", reason: "暗号化しないものの説明で、設定へ行くように言う文ではない" },
  "dataHandling.ai": { kind: "no-button", reason: "AI の機能がいつ使われるかの説明で、設定へ行くように言う文ではない" },
};

// 設定を開く呼び出し（navigation.openSettings か、それを渡された onOpen…Settings）。
const OPENS_SETTINGS = /\bopenSettings\(|\bonOpen\w*Settings\b|\bopen\w*SettingsRef\b/;

const settingsDirectionKeys = (Object.entries(japaneseMessages) as Array<[MessageKey, string]>)
  .filter(([, text]) => SETTINGS_DIRECTION.test(text))
  .map(([key]) => key);

describe("「設定」へ行くように言う文言", () => {
  it("すべて、行き先のボタンがあるか、要らない理由が書いてある", () => {
    expect(settingsDirectionKeys.filter((key) => DIRECTIONS[key] === undefined)).toEqual([]);
  });

  it("一覧に、もう無い文言や、設定へ行くように言わなくなった文言が残っていない", () => {
    expect(Object.keys(DIRECTIONS).filter((key) => !settingsDirectionKeys.includes(key as MessageKey))).toEqual([]);
  });

  it.each(Object.entries(DIRECTIONS).filter(([, direction]) => direction?.kind === "button"))("%s を出す部品は、設定を開ける", (_key, direction) => {
    for (const path of (direction as { shownIn: string[] }).shownIn) {
      expect(readFileSync(path, "utf8"), path).toMatch(OPENS_SETTINGS);
    }
  });
});
