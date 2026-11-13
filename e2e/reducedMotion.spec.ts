// OS の「動きを減らす」設定（prefers-reduced-motion）に従うか。

import { expect, test } from "@playwright/test";
import { createNoteOnDesktop, insertBodyHtml, startLocalVault } from "./devices";

const LONG_BODY_LINE_COUNT = 60;

for (const reducedMotion of ["reduce", "no-preference"] as const) {
  const expectation = reducedMotion === "reduce" ? "その場で移す" : "滑らかに送る";
  test(`目次から見出しへは、動きを減らす設定が ${reducedMotion} なら${expectation}`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion });
    await startLocalVault(page);
    await createNoteOnDesktop(page, "長いメモ");
    const lines = Array.from({ length: LONG_BODY_LINE_COUNT }, (_, index) => `<p>本文 ${index}</p>`).join("");
    await insertBodyHtml(page, `${lines}<h2>最後の節</h2>`);
    await page.getByRole("button", { name: "目次" }).click();
    await page.locator(".document-scroll").evaluate((scroller) => scroller.scrollTo({ top: 0 }));

    // 押した直後（同じ処理の中）に、もう送り終えているかを見る。滑らかに送るときは、まだ動いていない。
    const scrolledAtOnce = await page.evaluate(() => {
      const scroller = document.querySelector(".document-scroll")!;
      const entry = [...document.querySelectorAll<HTMLButtonElement>('nav[aria-label="目次"] button')].find((button) => button.textContent === "最後の節")!;
      entry.click();
      return scroller.scrollTop > 0;
    });
    expect(scrolledAtOnce).toBe(reducedMotion === "reduce");
    await expect(page.locator(".ProseMirror h2")).toBeInViewport();
  });
}
