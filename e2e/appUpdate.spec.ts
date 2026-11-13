import { expect, type Page, test } from "@playwright/test";
import { createNoteOnDesktop, openSettingsPage, PASSPHRASE, placeCursorAtBodyEnd, startLocalVault } from "./devices";

// GitHub のリリースの一覧（いちばん新しいリリース）。試験では本物の GitHub につながず、ここで答える。
const LATEST_RELEASE_API = "https://api.github.com/repos/aida0710/sedum-note/releases/latest";
const NEWER_RELEASE = { tag_name: "v99.0.0", html_url: "https://github.com/aida0710/sedum-note/releases/tag/v99.0.0" };
const OLDER_RELEASE = { tag_name: "v0.0.1", html_url: "https://github.com/aida0710/sedum-note/releases/tag/v0.0.1" };

type LatestReleaseAnswer = { tag_name: string; html_url: string } | "offline";

// 答えは途中で変えられる。問い合わせの回数も数える。
async function answerLatestRelease(page: Page, firstAnswer: LatestReleaseAnswer) {
  const github = { answer: firstAnswer, requests: 0 };
  await page.route(LATEST_RELEASE_API, async (route) => {
    github.requests += 1;
    if (github.answer === "offline") {
      await route.abort("internetdisconnected");
      return;
    }
    await route.fulfill({ json: github.answer, headers: { "Access-Control-Allow-Origin": "*" } });
  });
  return github;
}

test("Web 版は、ロックを解除しても自分からは確かめず、「更新を確認する」で確かめる。確かめられなければ、最新とは言わずにそう出す", async ({ page }) => {
  const github = await answerLatestRelease(page, "offline");
  await startLocalVault(page);
  await openSettingsPage(page, "更新");
  expect(github.requests).toBe(0);
  const checkNow = page.getByRole("button", { name: "更新を確認する" });

  await checkNow.click();
  await expect(page.getByRole("alert")).toContainText("新しいバージョンがあるかを確認できませんでした");
  await expect(page.getByText(/最新のバージョンです/)).toHaveCount(0);

  github.answer = OLDER_RELEASE;
  await checkNow.click();
  await expect(page.getByRole("status")).toContainText(/最新のバージョンです（.+ に確認しました）/);
  await expect(page.getByRole("alert")).toHaveCount(0);
  expect(github.requests).toBe(2);
});

test("新しいバージョンがあれば、設定と左の列に知らせ、「読み込み直して更新」で、書いたメモを保存してからページを読み込み直す", async ({ page }) => {
  await answerLatestRelease(page, NEWER_RELEASE);
  await startLocalVault(page);
  await createNoteOnDesktop(page, "読み込み直す前のメモ");
  await placeCursorAtBodyEnd(page);
  await page.keyboard.type("読み込み直す直前に書いた文");
  await openSettingsPage(page, "更新");

  await page.getByRole("button", { name: "更新を確認する" }).click();
  await expect(page.locator(".settings-section .notice")).toHaveText("新しいバージョン 99.0.0 があります");
  await expect(page.locator(".update-chip")).toHaveText("新しいバージョン 99.0.0 があります");
  await page.getByRole("button", { name: "読み込み直して更新" }).click();

  await expect(page.getByRole("heading", { name: "ロックを解除" })).toBeVisible();
  await page.getByLabel("パスフレーズ").fill(PASSPHRASE);
  await page.getByRole("button", { name: "解除" }).click();
  await page.getByRole("button", { name: "読み込み直す前のメモ" }).click();
  await expect(page.locator(".ProseMirror")).toContainText("読み込み直す直前に書いた文");
});
