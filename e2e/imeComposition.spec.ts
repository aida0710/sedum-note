import { expect, test } from "@playwright/test";
import { newTestRemoteConfig } from "../integration/testStorage";
import { openSyncedDevice } from "./devices";

// 日本語の変換中（未確定の文字がある間）に、ほかのデバイスの変更が同じ段落へマージされても、
// 変換が壊れず、確定した文字とほかのデバイスの文字の両方が残ることを確かめる。
// 変換は Chromium の DevTools の Input.imeSetComposition で作る。
test("日本語の変換中に、ほかのデバイスの変更が同じ段落に入っても、変換した文字が残る", async ({ browser, browserName }) => {
  test.skip(browserName !== "chromium", "変換は Chromium の DevTools で作る");
  const remoteConfig = await newTestRemoteConfig();
  const open = (join: boolean) => openSyncedDevice(browser, { remoteConfig, join });

  const laptop = await open(false);
  await laptop.getByRole("button", { name: "新しいメモ" }).click();
  await laptop.getByPlaceholder("タイトル").fill("変換の確認");
  await laptop.getByPlaceholder("タイトル").press("Enter");
  await laptop.keyboard.type("最初の文。");
  await expect(laptop.getByText(/同期済み/)).toBeVisible({ timeout: 20_000 });
  await laptop.waitForTimeout(3_000);

  const phone = await open(true);
  await phone.getByRole("button", { name: /変換の確認/ }).first().click();
  await expect(phone.locator(".ProseMirror")).toContainText("最初の文。");

  // PC は段落の末尾で変換を始め、未確定の「にほんご」を持ったままにする。
  await laptop.locator(".ProseMirror").getByText("最初の文。").click();
  await laptop.keyboard.press("End");
  const devTools = await laptop.context().newCDPSession(laptop);
  await devTools.send("Input.imeSetComposition", { text: "にほんご", selectionStart: 4, selectionEnd: 4 });

  // その間に、スマホが同じ段落の先頭へ書き足して送る。PC は「今すぐ同期」の代わりに、
  // 画面に戻ったときの同期（visibilitychange）で取り込む。
  await phone.locator(".ProseMirror").getByText("最初の文。").click();
  await phone.keyboard.press("Home");
  await phone.keyboard.type("スマホの文。");
  await expect(phone.getByText(/同期済み/)).toBeVisible({ timeout: 20_000 });
  await phone.waitForTimeout(3_000);
  await laptop.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await expect(laptop.locator(".ProseMirror")).toContainText("スマホの文。", { timeout: 20_000 });

  // 変換を確定する。
  await devTools.send("Input.insertText", { text: "日本語" });
  await expect(laptop.locator(".ProseMirror")).toContainText("スマホの文。最初の文。日本語");
  await expect(laptop.locator(".ProseMirror")).not.toContainText("にほんご");
  await expect(laptop.getByText(/同期済み/)).toBeVisible({ timeout: 20_000 });
});
