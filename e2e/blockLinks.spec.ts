import { expect, type Page, test } from "@playwright/test";
import { createNoteOnDesktop, startLocalVault } from "./devices";

const link = (page: Page) => page.locator(".ProseMirror .note-link button");

// 「計画」に 2 つの段落を書き、「メモ」から 2 つ目の段落へリンクする。
async function linkToSecondParagraph(page: Page): Promise<void> {
  await startLocalVault(page);
  await createNoteOnDesktop(page, "計画");
  await page.keyboard.type("出発は朝");
  await page.keyboard.press("Enter");
  await page.keyboard.type("宿は駅前");
  await createNoteOnDesktop(page, "メモ");
  await page.keyboard.type("/ぶろっく");
  await page.keyboard.press("Enter");
  await page.getByRole("dialog", { name: "リンクするブロックのあるメモを選ぶ" }).getByRole("button", { name: "計画" }).click();
  const blockPicker = page.getByRole("dialog", { name: "「計画」の中の、リンクするブロックを選ぶ" });
  await expect(blockPicker.locator(".menu-item")).toHaveText(["出発は朝", "宿は駅前"]);
  await blockPicker.getByRole("button", { name: "宿は駅前" }).click();
  await expect(link(page)).toHaveText("計画 › 宿は駅前");
}

// カーソルの位置に、HTML を貼り付ける。
async function pasteHtml(page: Page, html: string): Promise<void> {
  await page.evaluate((pastedHtml) => {
    const transfer = new DataTransfer();
    transfer.setData("text/html", pastedHtml);
    document.querySelector(".ProseMirror")!.dispatchEvent(new ClipboardEvent("paste", { clipboardData: transfer, bubbles: true, cancelable: true }));
  }, html);
}

test("ブロックへのリンクは、リンク先のブロックの今の文字を出し、押すとそのメモを開いてブロックまで送る", async ({ page }) => {
  await linkToSecondParagraph(page);
  await link(page).click();
  await expect(page.getByPlaceholder("タイトル")).toHaveValue("計画");
  await expect(page.locator(".ProseMirror .revealed-block")).toHaveText("宿は駅前");

  // カーソルはブロックの先頭にある。そこで文字を足すと、リンクの表示もついてくる。
  await page.keyboard.type("今夜の");
  await page.getByRole("tab", { name: "メモ" }).click();
  await expect(link(page)).toHaveText("計画 › 今夜の宿は駅前");
  // リンク先のメモには、バックリンクが出る。
  await page.getByRole("tab", { name: "計画" }).click();
  await expect(page.getByRole("region", { name: "このメモへのリンク" }).getByRole("button", { name: "メモ" })).toBeVisible();
});

test("リンクされたブロックの先頭で Enter を押しても、リンクは中身のある行を指したまま", async ({ page }) => {
  await linkToSecondParagraph(page);
  await link(page).click();
  await expect(page.locator(".ProseMirror .revealed-block")).toHaveText("宿は駅前");
  await page.keyboard.press("Enter");
  await expect(page.locator(".ProseMirror p")).toHaveText(["出発は朝", "", "宿は駅前"]);
  await expect(page.locator(".ProseMirror p[data-block-id]")).toHaveText("宿は駅前");
  // 行の途中で分けると、リンクは前半を指す。
  await page.keyboard.press("ArrowRight");
  await page.keyboard.type("屋");
  await page.keyboard.press("Enter");
  await expect(page.locator(".ProseMirror p")).toHaveText(["出発は朝", "", "宿屋", "は駅前"]);
  await expect(page.locator(".ProseMirror p[data-block-id]")).toHaveText("宿屋");
  await page.getByRole("tab", { name: "メモ" }).click();
  await expect(link(page)).toHaveText("計画 › 宿屋");
});

test("リンクされたブロックの写しを貼っても、リンクは元のブロックを指す。ブロックを消すと、リンクはその旨を出す", async ({ page }) => {
  await linkToSecondParagraph(page);
  await page.getByRole("tab", { name: "計画" }).click();
  const linkedBlock = page.locator(".ProseMirror p[data-block-id]");
  const blockId = await linkedBlock.getAttribute("data-block-id");
  // 元のブロックより上（本文の先頭）に貼る。複数の段落を貼ると、間の段落は属性ごと入る（1 つ目と最後は、貼った先の段落につながる）。
  await page.locator(".ProseMirror").click();
  await page.keyboard.press("Control+Home");
  await page.keyboard.type("頭");
  await pasteHtml(page, `<p>と</p><p data-block-id="${blockId}">写し</p><p>末尾</p>`);
  await expect(page.locator(".ProseMirror p")).toHaveText(["頭と", "写し", "末尾出発は朝", "宿は駅前"]);
  await expect(linkedBlock).toHaveText("宿は駅前");

  await page.keyboard.press("Control+a");
  await page.keyboard.press("Delete");
  await page.keyboard.type("書き直した");
  await page.getByRole("tab", { name: "メモ" }).click();
  await expect(link(page)).toHaveText("計画（ブロックが削除されました）");
  // ブロックが消えていても、メモは開ける。
  await link(page).click();
  await expect(page.getByPlaceholder("タイトル")).toHaveValue("計画");
});

test("箇条書きの項目へリンクできる。折りたたんだ項目の中にあっても、押すと開いて見せる。項目の先頭で Enter を押しても、リンクは同じ項目を指す", async ({ page }) => {
  await startLocalVault(page);
  await createNoteOnDesktop(page, "買い物");
  await page.keyboard.type("- 野菜");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Tab");
  await page.keyboard.type("にんじん");
  await createNoteOnDesktop(page, "メモ");
  await page.keyboard.type("/ぶろっく");
  await page.keyboard.press("Enter");
  await page.getByRole("dialog", { name: "リンクするブロックのあるメモを選ぶ" }).getByRole("button", { name: "買い物" }).click();
  await page.getByRole("dialog", { name: "「買い物」の中の、リンクするブロックを選ぶ" }).getByRole("button", { name: "にんじん" }).click();
  await expect(link(page)).toHaveText("買い物 › にんじん");

  await page.getByRole("tab", { name: "買い物" }).click();
  await page.getByRole("button", { name: "折りたたむ" }).click();
  await expect(page.locator(".ProseMirror li.collapsed-item")).toHaveCount(1);
  await page.getByRole("tab", { name: "メモ" }).click();
  await link(page).click();
  await expect(page.locator(".ProseMirror li.collapsed-item")).toHaveCount(0);
  await expect(page.locator(".ProseMirror li.revealed-block")).toHaveText("にんじん");

  await page.keyboard.press("Enter");
  await expect(page.locator(".ProseMirror li li")).toHaveText(["", "にんじん"]);
  await expect(page.locator(".ProseMirror li[data-block-id]")).toHaveText("にんじん");
});
