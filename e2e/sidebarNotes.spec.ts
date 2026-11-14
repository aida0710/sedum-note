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
  await expect(viewRow(page, "旅行").locator(".count")).toHaveCount(0);

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
  await expect(viewRow(page, "仕事").locator(".count")).toHaveCount(0);
  await expect(page.locator(".view-group.drop-target")).toHaveCount(0);
  await expect(page.locator(".nav-row.dragging")).toHaveCount(0);
});

test("メモを畳んだノートブックへ落とすと、移した先を知らせて開き、「元に戻す」で元のノートブックへ戻る", async ({ page }) => {
  await startLocalVault(page);
  await addNotebookOnDesktop(page, "仕事");
  await addNotebookOnDesktop(page, "旅行");
  await viewRow(page, "仕事").locator(".nav").click();
  await createNoteOnDesktop(page, "議事録");
  // 落とし先を畳んでおく（選んでから、もう一度押すと畳む）。
  const travelRow = viewRow(page, "旅行").locator(".nav");
  await travelRow.click();
  await travelRow.click();
  await expect(travelRow).toHaveAttribute("aria-expanded", "false");

  await noteRow(page, "議事録").locator(".tree-note").dragTo(travelRow);
  await expect(viewRow(page, "旅行").locator(".count")).toHaveText("1");
  await expect(viewRow(page, "仕事").locator(".count")).toHaveCount(0);
  await expect(travelRow).toHaveAttribute("aria-expanded", "true");
  const toast = page.getByRole("status").filter({ hasText: "「議事録」を「旅行」に移動しました" });
  await toast.getByRole("button", { name: "元に戻す" }).click();
  await expect(viewRow(page, "旅行").locator(".count")).toHaveCount(0);
  await expect(viewRow(page, "仕事").locator(".count")).toHaveText("1");
});

test("メモをドラッグしたまま畳んだノートブックの上にとどまると、そのノートブックが開く", async ({ page }) => {
  await startLocalVault(page);
  await addNotebookOnDesktop(page, "旅行");
  await createNoteOnDesktop(page, "持ち物");
  const travelRow = viewRow(page, "旅行").locator(".nav");
  await travelRow.click();
  await travelRow.click();
  await expect(travelRow).toHaveAttribute("aria-expanded", "false");

  await viewRow(page, "すべてのメモ").locator(".nav").click();
  await noteRow(page, "持ち物").locator(".tree-note").hover();
  await page.mouse.down();
  const travelBox = (await travelRow.boundingBox())!;
  await page.mouse.move(travelBox.x + travelBox.width / 2, travelBox.y + travelBox.height / 2, { steps: 8 });
  // 試験のブラウザは、行に入った動きでは dragenter だけを送る。行の上でもう一度動かして dragover を送る。
  await page.mouse.move(travelBox.x + travelBox.width / 2 + 2, travelBox.y + travelBox.height / 2);
  // 落とさずに待つと開く。
  await expect(travelRow).toHaveAttribute("aria-expanded", "true");
  await page.mouse.up();
  await expect(viewRow(page, "旅行").locator(".count")).toHaveText("1");
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
  await expect(trashCount).toHaveCount(0);
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

  // 2 回目は、キーボードだけで選ぶ: 言葉で絞り、↓ ↑ で選んで、Enter で決める。
  await page.getByRole("button", { name: "その他の操作" }).click();
  await page.getByRole("menuitem", { name: "ほかのメモを結合" }).click();
  const picker = page.getByRole("dialog", { name: "結合するメモを選ぶ" });
  await expect(picker.getByPlaceholder("メモを検索")).toBeFocused();
  await expect(picker.locator(".menu-item").first()).toHaveClass(/on/);
  await page.keyboard.press("ArrowDown");
  await expect(picker.locator(".menu-item").nth(1)).toHaveClass(/on/);
  await page.keyboard.type("材料");
  await expect(picker.locator(".menu-item")).toHaveText(["材料"]);
  await page.keyboard.press("Enter");
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
  await expect(trashCount).toHaveCount(0);

  // 選んだメモの 1 つで Delete を押すと、選んだメモがまとめてゴミ箱に入り、選択は外れる。
  await row(3).click();
  await row(1).click({ modifiers: ["ControlOrMeta"] });
  await row(1).press("Delete");
  await expect(trashCount).toHaveText("2");
  await expect(page.locator(".tree-note.selected")).toHaveCount(0);
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

test("左の列のメモの行で F2 を押すと名前を変えられ、決めるとフォーカスが行へ戻る。Delete でゴミ箱に入り、次の行へフォーカスが移る", async ({ page }) => {
  await startLocalVault(page);
  for (const title of ["一つ目", "二つ目", "三つ目"]) {
    await createNoteOnDesktop(page, title);
  }
  // 並びは新しい順（三つ目、二つ目、一つ目）。
  const secondRow = noteRow(page, "二つ目").locator(".tree-note");
  await secondRow.focus();
  await page.keyboard.press("F2");
  const nameInput = page.locator(".sidebar .inline-input");
  await expect(nameInput).toBeFocused();
  await nameInput.fill("二つ目の改名");
  await page.keyboard.press("Enter");
  const renamedRow = noteRow(page, "二つ目の改名").locator(".tree-note");
  await expect(renamedRow).toBeFocused();

  // Esc でやめても、行へ戻る。
  await page.keyboard.press("F2");
  await nameInput.fill("使わない名前");
  await page.keyboard.press("Escape");
  await expect(renamedRow).toBeFocused();

  await page.keyboard.press("Delete");
  await expect(page.getByRole("status").filter({ hasText: "ゴミ箱に入れました" })).toBeVisible();
  await expect(noteRow(page, "二つ目の改名")).toHaveCount(0);
  // 名前を変えたメモは更新が新しいので先頭に並んでいた。その次の行は「三つ目」。
  await expect(noteRow(page, "三つ目").locator(".tree-note")).toBeFocused();
});

test("名前を変える欄は、元の名前と同じ位置に出て、行の高さとノートブックの印を保つ。切れた名前は title で全部読める", async ({ page }) => {
  await startLocalVault(page);
  const longName = "とても長い名前のノートブックで、左の列には収まらないもの";
  await addNotebookOnDesktop(page, longName);
  const notebookRow = viewRow(page, longName);
  await expect(notebookRow.locator(".nav")).toHaveAttribute("title", longName);
  const labelBefore = (await notebookRow.locator(".nav-label").boundingBox())!;
  const rowHeightBefore = (await notebookRow.boundingBox())!.height;

  await notebookRow.locator(".nav").focus();
  await page.keyboard.press("F2");
  const nameInput = page.locator(".sidebar .inline-input");
  await expect(nameInput).toBeFocused();
  const namingRow = page.locator(".sidebar .nav-row", { has: page.locator(".inline-input") });
  // 欄の中の文字の左端（欄の左端 + 枠 1px + 余白 8px）が、元の名前の左端と同じ。
  const inputBox = (await nameInput.boundingBox())!;
  expect(Math.abs(inputBox.x + 9 - labelBefore.x)).toBeLessThanOrEqual(1);
  expect((await namingRow.boundingBox())!.height).toBe(rowHeightBefore);
  await expect(namingRow.locator(".dot, .notebook-icon")).toHaveCount(1);
  await expect(namingRow.locator(".disclosure")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(notebookRow.locator(".nav")).toBeFocused();
});

test("左の列のメモの題は、親の一覧の名前と左端がそろい、行の高さも同じ", async ({ page }) => {
  await startLocalVault(page);
  await addNotebookOnDesktop(page, "仕事");
  await viewRow(page, "仕事").locator(".nav").click();
  await createNoteOnDesktop(page, "議事録");
  const textLeftOf = (selector: string) => page.locator(selector).first().evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    return Math.round(range.getBoundingClientRect().left);
  });
  const notebookGroup = '.view-group:has(> .nav-row .nav[title="仕事"])';
  expect(await textLeftOf(`${notebookGroup} .tree-note`)).toBe(await textLeftOf(`${notebookGroup} > .nav-row .nav-label`));
  const heights = await page.locator(".sidebar-scroll :is(.nav, .tree-note)").evaluateAll((rows) => [...new Set(rows.map((row) => row.getBoundingClientRect().height))]);
  expect(heights).toEqual([30]);
});

test("タブは Tab で届き、← → で切り替えられ、Shift+F10 でタブのメニューを開ける。題の全文は title で読める", async ({ page }) => {
  await startLocalVault(page);
  const longTitle = "とても長い題のメモで、タブの幅には収まらずに途中で切れてしまうもの";
  for (const title of ["一", "二", longTitle]) {
    await createNoteOnDesktop(page, title);
  }
  const tabs = page.getByRole("tab");
  await expect(tabs.nth(2)).toHaveAttribute("title", longTitle);
  // Tab で止まるのは、選んでいるタブだけ。
  await expect(tabs.nth(2)).toHaveAttribute("tabindex", "0");
  await expect(tabs.nth(0)).toHaveAttribute("tabindex", "-1");

  await tabs.nth(2).focus();
  await page.keyboard.press("ArrowLeft");
  await expect(tabs.nth(1)).toHaveAttribute("aria-selected", "true");
  await expect(tabs.nth(1)).toBeFocused();
  await page.keyboard.press("Home");
  await expect(tabs.nth(0)).toBeFocused();
  await expect(page.getByPlaceholder("タイトル")).toHaveValue("一");

  await page.keyboard.press("Shift+F10");
  await page.getByRole("menuitem", { name: "タブをピン留め" }).click();
  await expect(tabs.nth(0).getByRole("button", { name: "タブを閉じる" })).toHaveCount(0);
});

test("ピン留めしたタブは、タブを閉じるキーでは閉じない。閉じたタブを開き直すと、元の位置へ戻る", async ({ page }) => {
  await startLocalVault(page);
  for (const title of ["一", "二", "三"]) {
    await createNoteOnDesktop(page, title);
  }
  const tabs = page.getByRole("tab");
  await page.getByRole("tab", { name: "二" }).click();
  await page.keyboard.press("Control+Alt+w");
  await expect(tabs).toHaveText(["一", "三"]);
  await page.keyboard.press("Control+Alt+Shift+t");
  await expect(tabs).toHaveText(["一", "二", "三"]);

  await page.getByRole("tab", { name: "二" }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "タブをピン留め" }).click();
  await expect(page.getByRole("tab", { name: "二" })).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Control+Alt+w");
  await expect(tabs).toHaveText(["二", "一", "三"]);
});

test("左の列をいちばん狭くしても、上の行のボタンは列の外へはみ出さない", async ({ page }) => {
  await startLocalVault(page);
  const handle = (await page.locator(".sidebar-resize-handle").boundingBox())!;
  await page.mouse.move(handle.x + handle.width / 2, 400);
  await page.mouse.down();
  await page.mouse.move(100, 400, { steps: 5 });
  await page.mouse.up();
  const sidebar = (await page.locator(".sidebar").boundingBox())!;
  expect(sidebar.width).toBe(200);
  const searchButton = (await page.locator(".sidebar-brand").getByRole("button", { name: "検索" }).boundingBox())!;
  expect(searchButton.x + searchButton.width).toBeLessThanOrEqual(sidebar.x + sidebar.width);
});

test("左の列の幅のつまみは Tab で止まり、← → で幅を変えられ、Home と End でいちばん狭く・広くなる", async ({ page }) => {
  await startLocalVault(page);
  const handle = page.getByRole("separator", { name: "左の列の幅を変える" });
  const sidebarWidth = async () => (await page.locator(".sidebar").boundingBox())!.width;
  const startWidth = await sidebarWidth();
  await handle.focus();
  await page.keyboard.press("ArrowRight");
  await expect.poll(sidebarWidth).toBe(startWidth + 16);
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowLeft");
  await expect.poll(sidebarWidth).toBe(startWidth - 16);
  await page.keyboard.press("Home");
  await expect.poll(sidebarWidth).toBe(200);
  await expect(handle).toHaveAttribute("aria-valuenow", "200");
  await page.keyboard.press("End");
  await expect.poll(sidebarWidth).toBe(520);
});

test("左の列のメモの行で Shift+↑↓ を押すと、隣のメモへ移りながら選んだメモが広がり、縮む", async ({ page }) => {
  await startLocalVault(page);
  // ノートブックが無いうちは、「すべてのメモ」が開いている。
  for (const title of ["りんご", "みかん", "ぶどう", "もも"]) {
    await createNoteOnDesktop(page, title);
  }
  const titles = await page.locator(".tree-note").allTextContents();
  await noteRow(page, titles[1]!).locator(".tree-note").focus();
  await page.keyboard.press("Shift+ArrowDown");
  await page.keyboard.press("Shift+ArrowDown");
  await expect(page.locator(".tree-note.selected")).toHaveText([titles[1]!, titles[2]!, titles[3]!]);
  await expect(page.locator(".tree-note:focus")).toHaveText(titles[3]!);
  await page.keyboard.press("Shift+ArrowUp");
  await expect(page.locator(".tree-note.selected")).toHaveText([titles[1]!, titles[2]!]);
  // 起点より上へ移ると、起点から上へ選び直す。
  await page.keyboard.press("Shift+ArrowUp");
  await page.keyboard.press("Shift+ArrowUp");
  await expect(page.locator(".tree-note.selected")).toHaveText([titles[0]!, titles[1]!]);
  await page.keyboard.press("Escape");
  await expect(page.locator(".tree-note.selected")).toHaveCount(0);
});

test("左の列で英数字のキーを押すと、その文字で名前が始まる次の行へ移る", async ({ page }) => {
  await startLocalVault(page);
  await addNotebookOnDesktop(page, "Work");
  await addNotebookOnDesktop(page, "Travel");
  await addNotebookOnDesktop(page, "Tasks");
  await viewRow(page, "すべてのメモ").locator(".nav").focus();
  await page.keyboard.press("t");
  await expect(viewRow(page, "Tasks").locator(".nav")).toBeFocused();
  await page.keyboard.press("t");
  await expect(viewRow(page, "Travel").locator(".nav")).toBeFocused();
  await page.keyboard.press("W");
  await expect(viewRow(page, "Work").locator(".nav")).toBeFocused();
});

test("ノートブックの「…」の「移動…」で、別のノートブックの中や最上位の階層へ移せる", async ({ page }) => {
  await startLocalVault(page);
  await addNotebookOnDesktop(page, "仕事");
  await addNotebookOnDesktop(page, "会議");
  const openMoveDialog = async (name: string) => {
    await viewRow(page, name).hover();
    await viewRow(page, name).getByRole("button", { name: "その他の操作" }).click();
    await page.getByRole("menuitem", { name: "移動…" }).click();
    return page.getByRole("dialog", { name: `「${name}」の移動先` });
  };
  const dialog = await openMoveDialog("会議");
  // 自分と、今いる所（最上位の階層）は選べない。
  await expect(dialog.locator(".note-picker-list .menu-item")).toHaveText(["仕事"]);
  await page.keyboard.type("仕事");
  await page.keyboard.press("Enter");
  await expect(dialog).toHaveCount(0);
  // 移した先が開き、子として字下げされて並ぶ。
  const parentLeft = (await viewRow(page, "仕事").locator(".nav-label").boundingBox())!.x;
  const childLeft = (await viewRow(page, "会議").locator(".nav-label").boundingBox())!.x;
  expect(childLeft).toBeGreaterThan(parentLeft);

  const back = await openMoveDialog("会議");
  await expect(back.locator(".note-picker-list .menu-item")).toHaveText(["最上位の階層"]);
  await back.getByRole("button", { name: "最上位の階層" }).click();
  await expect.poll(async () => (await viewRow(page, "会議").locator(".nav-label").boundingBox())!.x).toBe(parentLeft);
});

test("名前の長いタグでも、左の列の行の頭のアイコンは縮まない。検索の欄は、検索のキーボードを出し、頭を大文字にしない", async ({ page }) => {
  await startLocalVault(page);
  await createNoteOnDesktop(page, "長いタグのメモ");
  await page.keyboard.type("#とても長いタグの名前ですとても長いタグの名前ですとても長いタグの名前です ");
  const tagIcon = page.locator(".nav", { hasText: "とても長いタグ" }).locator("> svg");
  await expect.poll(async () => (await tagIcon.boundingBox())?.width).toBe(15);

  await page.locator(".sidebar-brand").getByRole("button", { name: "検索" }).click();
  const search = page.getByPlaceholder("メモを検索");
  await expect(search).toHaveAttribute("type", "search");
  await expect(search).toHaveAttribute("enterkeyhint", "search");
  await expect(search).toHaveAttribute("autocapitalize", "off");
});

test("長い題のメモがあっても、グラフの点の題は短く切って全文を title で出し、クエリの条件は 1 行に並ぶ", async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 820 });
  await startLocalVault(page);
  const longTitle = "2026年度 第3四半期 プロダクト開発ロードマップと各チームの担当範囲・リリース予定日の一覧（改訂版）";
  await createNoteOnDesktop(page, longTitle);
  await createNoteOnDesktop(page, "まとめ");
  await page.keyboard.type("/くえり");
  await page.keyboard.press("Enter");
  const conditions = page.locator(".note-query-conditions > :is(select, input)");
  const tops = await conditions.evaluateAll((elements) => elements.map((element) => Math.round(element.getBoundingClientRect().top)));
  expect(new Set(tops).size).toBe(1);

  await page.locator(".sidebar-brand").getByRole("button", { name: "グラフ表示" }).click();
  const point = page.locator(".note-graph-node", { has: page.locator("title", { hasText: longTitle }) });
  await expect(point.locator("text")).toHaveText("2026年度 第3四半期 プロダ…");
});

test("タブが多くても、ピン留めしたタブは並びを送っても左端に残る。並びの続きがある側の端は印が付く", async ({ page }) => {
  await startLocalVault(page);
  // タブは最小幅まで縮んでから溢れるので、縮めても並びに入り切らない数を開く。
  for (let index = 1; index <= 16; index += 1) {
    await createNoteOnDesktop(page, `とても長い題のメモ その ${index}`);
  }
  const strip = page.getByRole("tablist");
  for (const title of ["とても長い題のメモ その 1", "とても長い題のメモ その 2"]) {
    await page.getByRole("tab", { name: title, exact: true }).click({ button: "right" });
    await page.getByRole("menuitem", { name: "タブをピン留め" }).click();
  }
  await page.locator(".tab[title='とても長い題のメモ その 10']").click();
  await expect(strip).toHaveAttribute("data-more-start", "");
  const stripBox = (await strip.boundingBox())!;
  const pinnedBoxes = await page.locator(".tab.pinned").evaluateAll((tabs) => tabs.map((tab) => tab.getBoundingClientRect().toJSON() as DOMRect));
  expect(pinnedBoxes).toHaveLength(2);
  // 送ったあとも、ピン留めのタブは並びの左端から並んだまま見えていて、選んだタブはその右に見えている。
  expect(pinnedBoxes[0]!.left).toBeGreaterThanOrEqual(stripBox.x);
  expect(pinnedBoxes[1]!.left).toBeCloseTo(pinnedBoxes[0]!.right + 2, 0);
  const active = (await page.getByRole("tab", { selected: true }).boundingBox())!;
  expect(active.x).toBeGreaterThanOrEqual(pinnedBoxes[1]!.right - 1);

  // ピン留めの隣に隠れていたタブを選ぶと、ピン留めのタブの右に見える所まで送る。
  // 左の列から開くと、隠れていたタブを選ぶ。
  await page.locator(".tree-note", { hasText: "とても長い題のメモ その 3" }).click();
  const third = (await page.locator(".tab[title='とても長い題のメモ その 3']").boundingBox())!;
  expect(third.x).toBeGreaterThanOrEqual(pinnedBoxes[1]!.right - 1);
  await expect(strip).toHaveAttribute("data-more-end", "");
});

test("左の列は、選んだノートブックに地を塗らず、開いているメモの行だけに地を付ける。件数の 0 と空のノートブックの「メモはありません」は出さない", async ({ page }) => {
  await startLocalVault(page);
  await addNotebookOnDesktop(page, "仕事");
  await addNotebookOnDesktop(page, "趣味");
  await viewRow(page, "仕事").locator(".nav").click();
  await createNoteOnDesktop(page, "議事録");

  const workRow = viewRow(page, "仕事").locator(".nav");
  await expect(workRow).toHaveClass(/active/);
  await expect(workRow).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(workRow).toHaveCSS("font-weight", "600");
  await expect(noteRow(page, "議事録").locator(".tree-note")).not.toHaveCSS("background-color", "rgba(0, 0, 0, 0)");

  // 空のノートブックは、件数・「メモはありません」・開閉の印を出さない。
  const hobbyGroup = page.locator(".view-group", { has: page.locator(".nav-label", { hasText: "趣味" }) });
  await expect(hobbyGroup.locator(".count")).toHaveCount(0);
  await expect(hobbyGroup.locator(".tree-empty")).toHaveCount(0);
  await expect(hobbyGroup.locator(".disclosure svg")).toHaveCount(0);
  await expect(viewRow(page, "仕事").locator(".count")).toHaveText("1");
});

test("中にノートブックがある、開いたノートブックには、階層の線を引く", async ({ page }) => {
  await startLocalVault(page);
  await addNotebookOnDesktop(page, "仕事");
  await addNotebookOnDesktop(page, "旅行");
  await viewRow(page, "仕事").hover();
  await viewRow(page, "仕事").getByRole("button", { name: "その他の操作" }).click();
  await page.getByRole("menuitem", { name: "中にノートブックを追加" }).click();
  await page.getByPlaceholder("ノートブックの名前").fill("会議");
  await page.getByPlaceholder("ノートブックの名前").press("Enter");

  const groupOf = (name: string) => page.locator(".view-group", { has: page.locator(":scope > .nav-row .nav-label", { hasText: name }) });
  await expect(groupOf("仕事")).toHaveClass(/with-child-notebooks/);
  await expect(groupOf("旅行")).not.toHaveClass(/with-child-notebooks/);
  // 線は開閉の印の真下（左の余白 8px + 印の幅の半分 6px）にある。
  expect(await groupOf("仕事").evaluate((group) => getComputedStyle(group, "::after").left)).toBe("14px");
});

test("開いているタブは太字にせず、タブが多いと最小幅まで縮んで並びに収まる。ピン留めのタブはアイコンだけの小さなタブになる", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await startLocalVault(page);
  await addNotebookOnDesktop(page, "旅行");
  await viewRow(page, "旅行").locator(".nav").click();
  for (let index = 1; index <= 8; index += 1) {
    await createNoteOnDesktop(page, `とても長い題のメモ その ${index}`);
  }
  const strip = page.locator(".tabs");
  await expect(page.locator(".tab.on")).toHaveCSS("font-weight", "400");
  // 8 つのタブが縮んで、横に送らずに全部見える。
  expect(await strip.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  const widths = await page.getByRole("tab").evaluateAll((tabs) => tabs.map((tab) => Math.round(tab.getBoundingClientRect().width)));
  expect(Math.max(...widths)).toBeLessThan(200);
  expect(Math.min(...widths)).toBeGreaterThanOrEqual(96);

  await page.getByRole("tab", { name: "とても長い題のメモ その 3" }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "タブをピン留め" }).click();
  const pinned = page.getByRole("tab", { name: "とても長い題のメモ その 3" });
  await expect(pinned).toHaveCSS("width", "40px");
  await expect(pinned).toHaveAttribute("title", "とても長い題のメモ その 3");
  // アイコンは、メモのノートブック（旅行）の色。
  const notebookColor = await viewRow(page, "旅行").locator(".dot").evaluate((dot) => getComputedStyle(dot).backgroundColor);
  await expect(pinned.locator(".tab-pinned-icon")).toHaveCSS("color", notebookColor);
});
