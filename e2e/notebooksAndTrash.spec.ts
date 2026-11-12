import { expect, test } from "@playwright/test";
import { addNotebookOnDesktop, createNoteOnDesktop, openSettingsPage, startLocalVault } from "./devices";

test("ノートブックの色とアイコンを選ぶと、左の列の印が変わり、開き直しても保たれる", async ({ page }) => {
  await startLocalVault(page);
  await addNotebookOnDesktop(page, "旅行");
  const row = page.locator(".nav-row", { hasText: "旅行" });
  // 選ぶ前は、自動の色（1 つ目は青）の点。
  await expect(row.locator(".dot")).toHaveCSS("background-color", "rgb(47, 111, 222)");

  await row.hover();
  await row.getByRole("button", { name: "その他の操作" }).click();
  await page.getByRole("menuitem", { name: "色とアイコン" }).click();
  const dialog = page.getByRole("dialog", { name: "色とアイコン" });
  await dialog.getByRole("radio", { name: "緑", exact: true }).click();
  await dialog.getByRole("radio", { name: "plane" }).click();
  await dialog.getByRole("button", { name: "閉じる" }).click();
  await expect(row.locator("svg.notebook-icon")).toHaveAttribute("stroke", "#2da44e");

  await page.waitForTimeout(500);
  await page.reload();
  await page.getByLabel("パスフレーズ").fill("correct horse battery");
  await page.getByRole("button", { name: "解除" }).click();
  await expect(page.locator(".nav-row", { hasText: "旅行" }).locator("svg.notebook-icon")).toHaveAttribute("stroke", "#2da44e");
});

test("ゴミ箱の自動削除は、既定ではオフ。日数を決めると、過ぎたメモがロック解除のときに完全に削除される", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-11-01T09:00:00+09:00") });
  await startLocalVault(page);
  await page.getByRole("button", { name: "新しいメモ" }).click();
  await page.getByPlaceholder("タイトル").fill("捨てるメモ");
  await page.getByRole("button", { name: "その他の操作" }).click();
  await page.getByRole("menuitem", { name: "ゴミ箱に入れる" }).click();
  const trashCount = page.locator(".nav-row", { hasText: "ゴミ箱" }).locator(".count");
  await expect(trashCount).toHaveText("1");

  await openSettingsPage(page, "一般");
  const autoDelete = page.getByLabel("ゴミ箱のメモを、日数がたったら完全に削除する");
  await expect(autoDelete).not.toBeChecked();
  await autoDelete.check();
  await page.getByLabel("ゴミ箱に残す日数").fill("0");
  await expect(page.getByRole("alert")).toContainText("1〜3650 の整数");

  // 捨ててから 5 日後に、日数を「7」と 1 文字ずつ打つ…のではなく「70」と打つ。途中の「7」では確定しない
  // （確定していたら、まだ残すはずのメモは消えないが、「3」のような短い途中の値では消えてしまう）。
  await page.clock.fastForward(5 * 24 * 60 * 60 * 1000);
  await page.getByLabel("ゴミ箱に残す日数").fill("");
  await page.getByLabel("ゴミ箱に残す日数").pressSequentially("30");
  await page.clock.runFor(1_000);
  // 途中の「3」（3 日）で確定していたら、5 日前に捨てたメモはここで消えている。
  await expect(trashCount).toHaveText("1");
  await page.getByLabel("ゴミ箱に残す日数").fill("7");
  await page.getByLabel("ゴミ箱に残す日数").blur();
  await expect(page.getByText("今の設定は 7 日です")).toBeVisible();
  await page.clock.runFor(1_000);
  // まだ 7 日たっていないので残る。
  await expect(trashCount).toHaveText("1");

  await page.clock.fastForward(3 * 24 * 60 * 60 * 1000);
  await page.reload();
  await page.getByLabel("パスフレーズ").fill("correct horse battery");
  await page.getByRole("button", { name: "解除" }).click();
  await expect(page.locator(".nav-row", { hasText: "ゴミ箱" }).locator(".count")).toHaveText("0");
});

test("ノートブックにプロパティを決めると、その中のメモに値を入れる欄が出て、開き直しても値が残る", async ({ page }) => {
  await startLocalVault(page);
  await addNotebookOnDesktop(page, "読書");
  await page.locator(".nav-row", { has: page.locator(".nav", { hasText: "読書" }) }).getByRole("button", { name: "その他の操作" }).click();
  await page.getByRole("menuitem", { name: "プロパティ" }).click();
  const dialog = page.getByRole("dialog", { name: "プロパティ" });
  await dialog.getByRole("button", { name: "プロパティを追加" }).click();
  await dialog.getByRole("textbox", { name: "名前" }).fill("状態");
  await dialog.getByRole("combobox", { name: "種類" }).selectOption("select");
  await dialog.getByRole("textbox", { name: "選択肢" }).fill("未読、読了");
  await dialog.getByRole("textbox", { name: "選択肢" }).blur();
  await dialog.getByRole("button", { name: "プロパティを追加" }).click();
  await dialog.getByRole("textbox", { name: "名前" }).last().fill("ページ数");
  await dialog.getByRole("combobox", { name: "種類" }).last().selectOption("number");
  await dialog.getByRole("button", { name: "閉じる" }).click();

  await page.locator(".nav", { hasText: "読書" }).click();
  await createNoteOnDesktop(page, "吾輩は猫である");
  await page.getByLabel("状態").selectOption("読了");
  await page.getByLabel("ページ数").fill("512");

  await createNoteOnDesktop(page, "別のメモ");
  await expect(page.getByLabel("状態")).toHaveValue("");
  await page.getByRole("tab", { name: "吾輩は猫である" }).click();
  await expect(page.getByLabel("状態")).toHaveValue("読了");
  await expect(page.getByLabel("ページ数")).toHaveValue("512");
});

test("データベース表示で、ノートブックのメモをプロパティの列つきの表とボードで見られ、値を変えられる", async ({ page }) => {
  await startLocalVault(page);
  await addNotebookOnDesktop(page, "読書");
  const notebookRow = page.locator(".nav-row", { has: page.locator(".nav", { hasText: "読書" }) });
  await notebookRow.getByRole("button", { name: "その他の操作" }).click();
  await page.getByRole("menuitem", { name: "プロパティ" }).click();
  const dialog = page.getByRole("dialog", { name: "プロパティ" });
  await dialog.getByRole("button", { name: "プロパティを追加" }).click();
  await dialog.getByRole("textbox", { name: "名前" }).fill("状態");
  await dialog.getByRole("combobox", { name: "種類" }).selectOption("select");
  await dialog.getByRole("textbox", { name: "選択肢" }).fill("未読、読了");
  await dialog.getByRole("textbox", { name: "選択肢" }).blur();
  await dialog.getByRole("button", { name: "閉じる" }).click();

  await page.locator(".nav", { hasText: "読書" }).click();
  await createNoteOnDesktop(page, "坊っちゃん");
  await createNoteOnDesktop(page, "こころ");
  await page.getByLabel("状態").selectOption("読了");

  await page.locator(".nav", { hasText: "読書" }).first().click({ button: "right" });
  await page.getByRole("menuitem", { name: "データベース表示" }).click();
  const database = page.locator(".database-view");
  await expect(database.locator("tbody tr")).toHaveCount(2);
  const rowOf = (title: string) => database.locator("tbody tr", { hasText: title });
  await expect(rowOf("こころ").getByRole("combobox", { name: "状態" })).toHaveValue("読了");
  await rowOf("坊っちゃん").getByRole("combobox", { name: "状態" }).selectOption("未読");

  // 見出しを押すと、その列で並べ替える。
  await database.getByRole("button", { name: "タイトル" }).click();
  await expect(database.locator("tbody tr .database-title")).toHaveText(["こころ", "坊っちゃん"]);

  await database.getByRole("radio", { name: "ボード" }).click();
  await expect(database.getByRole("region", { name: "未読" }).locator(".database-card")).toHaveText(["坊っちゃん"]);
  await expect(database.getByRole("region", { name: "読了" }).locator(".database-card")).toHaveText(["こころ"]);
  // 見え方はノートブックに保存されるので、タブを開き直しても残る。
  await page.getByRole("tab", { name: "読書" }).getByRole("button", { name: "タブを閉じる" }).click();
  await page.locator(".nav", { hasText: "読書" }).first().click({ button: "right" });
  await page.getByRole("menuitem", { name: "データベース表示" }).click();
  await expect(database.getByRole("radio", { name: "ボード" })).toBeChecked();
  await database.getByRole("region", { name: "読了" }).locator(".database-card").click();
  await expect(page.getByPlaceholder("タイトル")).toHaveValue("こころ");
});
