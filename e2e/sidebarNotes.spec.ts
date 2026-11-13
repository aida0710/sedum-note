import { expect, type Page, test } from "@playwright/test";
import { addNotebookOnDesktop, createNoteOnDesktop, PHONE_VIEWPORT, startLocalVault } from "./devices";

function viewRow(page: Page, label: string) {
  return page.locator(".nav-row", { has: page.locator(".nav", { hasText: label }) });
}

function noteRow(page: Page, title: string) {
  return page.locator(".nav-row", { has: page.locator(".tree-note", { hasText: title }) });
}

test("メモをノートブックへドラッグすると、そのノートブックに入る", async ({ page }) => {
  await startLocalVault(page);
  await createNoteOnDesktop(page, "買い物");
  await addNotebookOnDesktop(page, "旅行");
  await expect(viewRow(page, "旅行").locator(".count")).toHaveText("0");

  await viewRow(page, "すべてのメモ").locator(".nav").click();
  await noteRow(page, "買い物").locator(".tree-note").dragTo(viewRow(page, "旅行"));
  await expect(viewRow(page, "旅行").locator(".count")).toHaveText("1");
});

test("メモを別のノートブックの中のメモの上へ落としても、そのノートブックへ移る。ドラッグ中は、元の行が薄くなり、ノートブックの範囲全体が光る", async ({ page }) => {
  await startLocalVault(page);
  await addNotebookOnDesktop(page, "仕事");
  await addNotebookOnDesktop(page, "旅行");
  await viewRow(page, "仕事").locator(".nav").click();
  await createNoteOnDesktop(page, "議事録");
  await viewRow(page, "旅行").locator(".nav").click();
  await createNoteOnDesktop(page, "持ち物");

  // 「議事録」を持ち上げて、旅行のノートブックの中の「持ち物」の行の上へ運ぶ。
  const source = noteRow(page, "議事録").locator(".tree-note");
  const target = noteRow(page, "持ち物").locator(".tree-note");
  await source.hover();
  await page.mouse.down();
  const targetBox = (await target.boundingBox())!;
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, { steps: 8 });
  await expect(noteRow(page, "議事録")).toHaveClass(/dragging/);
  const travelGroup = page.locator(".view-group", { has: viewRow(page, "旅行") });
  await expect(travelGroup).toHaveClass(/drop-target/);
  await expect(page.locator(".view-group.drop-target")).toHaveCount(1);
  await page.mouse.up();

  await expect(viewRow(page, "旅行").locator(".count")).toHaveText("2");
  await expect(viewRow(page, "仕事").locator(".count")).toHaveText("0");
  await expect(page.locator(".view-group.drop-target")).toHaveCount(0);
  await expect(page.locator(".nav-row.dragging")).toHaveCount(0);
});

// ノートブックの中（入れ子の一覧と中のメモの範囲）にある、別のノートブックの行。
function notebookRowsInside(page: Page, notebookName: string) {
  return page.locator(".view-group", { has: page.locator(":scope > .nav-row .nav", { hasText: notebookName }) }).locator(".view-group .nav-label");
}

test("ノートブックをドラッグして別のノートブックの中へ移し、「ノートブック」の見出しに落とすと一番上の段へ戻る。自分の中へは移せない", async ({ page }) => {
  await startLocalVault(page);
  await addNotebookOnDesktop(page, "仕事");
  await addNotebookOnDesktop(page, "旅行");
  await expect(notebookRowsInside(page, "仕事")).toHaveCount(0);

  await viewRow(page, "旅行").locator(".nav").dragTo(viewRow(page, "仕事"));
  await expect(notebookRowsInside(page, "仕事")).toHaveText(["旅行"]);

  // 仕事を、自分の中の旅行へは移せない。
  await viewRow(page, "仕事").locator(".nav").dragTo(viewRow(page, "旅行"));
  await expect(notebookRowsInside(page, "仕事")).toHaveText(["旅行"]);

  await viewRow(page, "旅行").locator(".nav").dragTo(page.locator(".section-title", { hasText: "ノートブック" }));
  await expect(notebookRowsInside(page, "仕事")).toHaveCount(0);
  await expect(viewRow(page, "旅行")).toBeVisible();
});

test("ノートブックを右クリックして「中にメモを追加」を選ぶと、そのノートブックに新しいメモができて開く", async ({ page }) => {
  await startLocalVault(page);
  await addNotebookOnDesktop(page, "旅行");
  await viewRow(page, "旅行").click({ button: "right" });
  await expect(page.getByRole("menuitem").first()).toHaveText("中にメモを追加");
  await page.getByRole("menuitem", { name: "中にメモを追加" }).click();
  await expect(page.getByPlaceholder("タイトル")).toBeFocused();
  await expect(viewRow(page, "旅行").locator(".count")).toHaveText("1");
});

test("メモをゴミ箱へドラッグすると知らせが出て、「元に戻す」で戻せる", async ({ page }) => {
  await startLocalVault(page);
  await createNoteOnDesktop(page, "買い物");
  const trashCount = viewRow(page, "ゴミ箱").locator(".count");

  await noteRow(page, "買い物").locator(".tree-note").dragTo(viewRow(page, "ゴミ箱"));
  await expect(trashCount).toHaveText("1");
  const toast = page.getByRole("status").filter({ hasText: "ゴミ箱に入れました" });
  await toast.getByRole("button", { name: "元に戻す" }).click();
  await expect(trashCount).toHaveText("0");
  await expect(toast).toBeHidden();
});

test("左の列のメモの「…」から、名前を変えたり、ゴミ箱に入れたりできる", async ({ page }) => {
  await startLocalVault(page);
  await createNoteOnDesktop(page, "買い物");

  await noteRow(page, "買い物").hover();
  await page.getByRole("button", { name: "「買い物」の操作" }).click();
  await page.getByRole("menuitem", { name: "名前を変更" }).click();
  await page.locator(".sidebar .inline-input").fill("週末の買い物");
  await page.locator(".sidebar .inline-input").press("Enter");
  await expect(page.getByRole("tab", { name: "週末の買い物" })).toBeVisible();

  // 名前を変えている途中で Escape を押すと、変えない。
  await noteRow(page, "週末の買い物").locator(".tree-note").dblclick();
  await page.locator(".sidebar .inline-input").fill("やめる名前");
  await page.locator(".sidebar .inline-input").press("Escape");
  await expect(page.getByRole("tab", { name: "週末の買い物" })).toBeVisible();
  await expect(page.locator(".sidebar")).not.toContainText("やめる名前");

  // 右クリックでも同じメニューが出る。
  await noteRow(page, "週末の買い物").click({ button: "right" });
  await page.getByRole("menuitem", { name: "ゴミ箱に入れる" }).click();
  await expect(viewRow(page, "ゴミ箱").locator(".count")).toHaveText("1");
  await expect(page.getByRole("status")).toContainText("ゴミ箱に入れました");
});

test("タブはドラッグで並べ替えられる", async ({ page }) => {
  await startLocalVault(page);
  await createNoteOnDesktop(page, "一つ目");
  await createNoteOnDesktop(page, "二つ目");
  await expect(page.getByRole("tab")).toHaveText([/一つ目/, /二つ目/]);

  await page.getByRole("tab", { name: "二つ目" }).dragTo(page.getByRole("tab", { name: "一つ目" }));
  await expect(page.getByRole("tab")).toHaveText([/二つ目/, /一つ目/]);
});

test("左の列の端をドラッグすると幅が変わり、開き直しても保たれる", async ({ page }) => {
  await startLocalVault(page);
  const sidebar = page.locator(".sidebar");
  const handle = page.getByRole("separator", { name: "左の列の幅を変える" });
  const handleBox = (await handle.boundingBox())!;

  await page.mouse.move(handleBox.x + handleBox.width / 2, 300);
  await page.mouse.down();
  await page.mouse.move(400, 300, { steps: 4 });
  await page.mouse.up();
  await expect.poll(async () => (await sidebar.boundingBox())!.width).toBe(400);

  await page.reload();
  await page.getByLabel("パスフレーズ").fill("correct horse battery");
  await page.getByRole("button", { name: "解除" }).click();
  await expect.poll(async () => (await sidebar.boundingBox())!.width).toBe(400);
});

test("スマホの幅では、ゴミ箱に入れた知らせが、下のメニューと「新しいメモ」のボタンに重ならない", async ({ browser }) => {
  const page = await (await browser.newContext({ viewport: PHONE_VIEWPORT })).newPage();
  await startLocalVault(page);
  await page.getByRole("button", { name: "新しいメモ" }).click();
  await page.getByPlaceholder("タイトル").fill("捨てるメモ");
  await page.getByRole("button", { name: "その他の操作" }).click();
  await page.getByRole("menuitem", { name: "ゴミ箱に入れる" }).click();
  await page.getByRole("button", { name: "戻る" }).click();

  const toast = (await page.getByRole("status").filter({ hasText: "ゴミ箱に入れました" }).boundingBox())!;
  const bottomNavigation = (await page.locator(".tabbar").boundingBox())!;
  const newNoteButton = (await page.getByRole("button", { name: "新しいメモ" }).boundingBox())!;
  expect(toast.y + toast.height).toBeLessThanOrEqual(bottomNavigation.y);
  expect(toast.x + toast.width <= newNoteButton.x || toast.y + toast.height <= newNoteButton.y).toBe(true);
});

test("メモを複製すると、同じ本文のコピーが開く。ほかのメモを結合すると、確かめてから、相手の本文が末尾に入り、相手はゴミ箱に入る", async ({ page }) => {
  await startLocalVault(page);
  await createNoteOnDesktop(page, "材料");
  await page.keyboard.type("小麦粉");
  await createNoteOnDesktop(page, "手順");
  await page.keyboard.type("混ぜる");

  await page.getByRole("button", { name: "その他の操作" }).click();
  await page.getByRole("menuitem", { name: "複製" }).click();
  await expect(page.getByPlaceholder("タイトル")).toHaveValue("「手順」のコピー");
  await expect(page.locator(".ProseMirror")).toHaveText("混ぜる");

  await page.getByRole("button", { name: "その他の操作" }).click();
  await page.getByRole("menuitem", { name: "ほかのメモを結合" }).click();
  // 選んだだけでは結合しない。確認をやめると、何も変わらない。
  await page.getByRole("dialog").getByRole("button", { name: "材料" }).click();
  const confirmation = page.getByRole("dialog").filter({ hasText: "「材料」の本文をこのメモの末尾に追加し、「材料」をゴミ箱に移動します。" });
  await confirmation.getByRole("button", { name: "キャンセル" }).click();
  await expect(page.locator(".ProseMirror")).toHaveText("混ぜる");
  await expect(noteRow(page, "材料")).toHaveCount(1);

  await page.getByRole("button", { name: "その他の操作" }).click();
  await page.getByRole("menuitem", { name: "ほかのメモを結合" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "材料" }).click();
  await confirmation.getByRole("button", { name: "結合" }).click();
  await expect(page.locator(".ProseMirror")).toHaveText("混ぜる材料小麦粉");
  await expect(page.locator(".ProseMirror h2")).toHaveText("材料");
  await expect(noteRow(page, "材料")).toHaveCount(0);
});

test("タブを右クリックすると、ほか・右のタブを閉じたり、ピン留めしたりできる。閉じたタブは開き直せ、右端のボタンから一覧で選べる", async ({ page }) => {
  await startLocalVault(page);
  for (const title of ["一", "二", "三", "四"]) {
    await createNoteOnDesktop(page, title);
  }
  const tabs = page.getByRole("tab");
  await expect(tabs).toHaveText(["一", "二", "三", "四"]);

  // 「三」をピン留めすると左に動き、× が消える。
  await page.getByRole("tab", { name: "三" }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "タブをピン留め" }).click();
  await expect(tabs).toHaveText(["三", "一", "二", "四"]);
  await expect(page.getByRole("tab", { name: "三" }).getByRole("button", { name: "タブを閉じる" })).toHaveCount(0);

  // 「一」の右を閉じても、ピン留めした「三」は残る。
  await page.getByRole("tab", { name: "一" }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "右のタブを閉じる" }).click();
  await expect(tabs).toHaveText(["三", "一"]);

  // 閉じたタブは、最後に閉じたものから開き直せる。
  await page.keyboard.press("Control+Alt+Shift+t");
  await expect(tabs).toHaveText(["三", "一", "四"]);

  await page.getByRole("tab", { name: "四" }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "ほかのタブを閉じる" }).click();
  await expect(tabs).toHaveText(["三", "四"]);

  // 右端のボタンから、開いているタブを選べる。
  await page.getByRole("button", { name: "開いているタブの一覧" }).click();
  await page.getByRole("menuitem", { name: "三" }).click();
  await expect(page.getByRole("tab", { name: "三" })).toHaveAttribute("aria-selected", "true");
});

test("左の列のメモを本文へドラッグすると、落とした所にそのメモへのリンクが入る", async ({ page }) => {
  await startLocalVault(page);
  await createNoteOnDesktop(page, "旅行の持ち物");
  await createNoteOnDesktop(page, "週の予定");
  await page.keyboard.type("金曜に確認する");

  const source = noteRow(page, "旅行の持ち物").locator(".tree-note");
  const paragraph = page.locator(".ProseMirror p", { hasText: "金曜に確認する" });
  await source.hover();
  await page.mouse.down();
  const box = (await paragraph.boundingBox())!;
  await page.mouse.move(box.x + 140, box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect(page.locator(".ProseMirror .note-link")).toHaveText("旅行の持ち物");
});


test("Ctrl と Shift で左の列のメモを複数選び、まとめてノートブックへ移したり、ゴミ箱に入れたりできる", async ({ page }) => {
  await startLocalVault(page);
  await addNotebookOnDesktop(page, "旅行");
  await viewRow(page, "すべてのメモ").locator(".nav").click();
  for (const title of ["りんご", "みかん", "ぶどう", "もも"]) {
    await createNoteOnDesktop(page, title);
  }
  const titles = await page.locator(".tree-note").allTextContents();
  const row = (index: number) => noteRow(page, titles[index]!).locator(".tree-note");

  // 普通に押したメモから、Shift で押したメモまでを選ぶ。Ctrl で押すと 1 件ずつ外せ、どちらでもメモは開かない。
  await row(0).click();
  await row(2).click({ modifiers: ["Shift"] });
  await expect(page.locator(".tree-note.selected")).toHaveCount(3);
  await row(1).click({ modifiers: ["ControlOrMeta"] });
  await expect(page.locator(".tree-note.selected")).toHaveText([titles[0]!, titles[2]!]);
  await expect(page.locator(".tree-note.active")).toHaveText(titles[0]!);

  // 選んだメモの 1 つをドラッグすると、選んだメモがまとめて移り、選択は外れる。
  await row(2).dragTo(viewRow(page, "旅行"));
  await expect(viewRow(page, "旅行").locator(".count")).toHaveText("2");
  await expect(page.locator(".tree-note.selected")).toHaveCount(0);

  // 開いているメモに Ctrl で足して、右クリックのメニューからまとめてゴミ箱に入れる。
  await row(3).click();
  await row(1).click({ modifiers: ["ControlOrMeta"] });
  await row(1).click({ button: "right" });
  await page.getByRole("menuitem", { name: "選んだ 2 件をゴミ箱に入れる" }).click();
  const trashCount = viewRow(page, "ゴミ箱").locator(".count");
  await expect(trashCount).toHaveText("2");
  const toast = page.getByRole("status").filter({ hasText: "2 件のメモをゴミ箱に入れました" });
  await toast.getByRole("button", { name: "元に戻す" }).click();
  await expect(trashCount).toHaveText("0");
});

test("左の列は、↑↓ で行を移り、→← で一覧を開け閉めし、Enter でメモを開ける", async ({ page }) => {
  await startLocalVault(page);
  await addNotebookOnDesktop(page, "旅行");
  await viewRow(page, "旅行").locator(".nav").click();
  await createNoteOnDesktop(page, "持ち物");
  await createNoteOnDesktop(page, "宿");
  const travel = viewRow(page, "旅行").locator(".nav");
  await travel.click();
  await expect(travel).toHaveAttribute("aria-expanded", "false");

  await travel.focus();
  await page.keyboard.press("ArrowRight");
  await expect(travel).toHaveAttribute("aria-expanded", "true");
  // 開いた一覧で → を押すと、中の最初のメモへ移る。↓ で次のメモへ移り、Enter で開く。
  await page.keyboard.press("ArrowRight");
  const firstNote = page.locator(".tree-note").first();
  await expect(page.locator(".tree-note:focus")).toHaveCount(1);
  const firstTitle = await page.locator(".tree-note:focus").textContent();
  await page.keyboard.press("ArrowDown");
  const secondTitle = await page.locator(".tree-note:focus").textContent();
  expect(new Set([firstTitle, secondTitle])).toEqual(new Set(["持ち物", "宿"]));
  await page.keyboard.press("Enter");
  await expect(page.getByRole("tab", { name: secondTitle!, selected: true })).toBeVisible();

  // メモの行で ← を押すと一覧の行へ戻り、もう一度 ← で閉じる。↑ で前の行へ移る。
  await noteRow(page, secondTitle!).locator(".tree-note").focus();
  await page.keyboard.press("ArrowLeft");
  await expect(travel).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(travel).toHaveAttribute("aria-expanded", "false");
  await expect(firstNote).toBeHidden();
  await page.keyboard.press("ArrowUp");
  await expect(travel).not.toBeFocused();
  await expect(page.locator(".sidebar-scroll button.nav:focus")).toHaveCount(1);
});
