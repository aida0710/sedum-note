// 組み立てたアプリ（Android・Windows）で、CSP に断られたものが無いかと、エディタの見た目の
// スタイル（Tiptap が差し込むもの）が効いているかを確かめる。手で流す確認の道具。
//
// 前提: syncWithApp.mjs と同じ。ロックを解除できる vault がアプリにあること。

import { chromium } from "@playwright/test";

const browser = await chromium.connectOverCDP(process.env.CDP_ENDPOINT ?? "http://127.0.0.1:9333", { noDefaults: true });
const page = browser.contexts()[0].pages()[0];
await page.evaluate(() => {
  window.__cspViolations = [];
  document.addEventListener("securitypolicyviolation", (event) =>
    window.__cspViolations.push(`${event.violatedDirective} ${event.blockedURI}`));
});
const locked = await page.getByRole("button", { name: "解除" }).isVisible().catch(() => false);
if (locked) {
  await page.getByLabel("パスフレーズ").fill("correct horse battery");
  await page.getByRole("button", { name: "解除" }).click();
}
await page.getByRole("button", { name: /で書いたメモ/ }).first().click();
await page.locator(".ProseMirror").waitFor();
const result = await page.evaluate(() => ({
  cspViolations: window.__cspViolations,
  // Tiptap は .ProseMirror に white-space: pre-wrap を差し込む。CSP で止められると normal になる。
  proseMirrorWhiteSpace: getComputedStyle(document.querySelector(".ProseMirror")).whiteSpace,
  cspMeta: document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.getAttribute("content") ?? null,
}));
console.log(JSON.stringify(result, null, 1));
await browser.close();
