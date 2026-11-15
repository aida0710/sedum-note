import { expect, type Locator, type Page, test } from "@playwright/test";
import { addNotebookOnDesktop, createNoteOnDesktop, openSettingsPage, PHONE_VIEWPORT, startLocalVault } from "./devices";

// プロパティのダイアログで、選択肢を 1 つずつ足す（足す欄に打って Enter）。
async function addPropertyOptions(dialog: Locator, options: string[]) {
  const input = dialog.getByRole("textbox", { name: "選択肢を追加" });
  for (const option of options) {
    await input.fill(option);
    await input.press("Enter");
  }
}

function notebookRow(page: Page, name: string) {
  return page.locator(".nav-row", { has: page.locator(".nav", { hasText: name }) });
}

// 開いているメモの「…」から、移すノートブックを選ぶダイアログを開く（PC は上のバー、スマホは上の行の「…」）。
async function openNotebookPicker(page: Page) {
  await page.locator(".editor-bar, .phone-top").getByRole("button", { name: "その他の操作" }).click();
  await page.getByRole("menuitem", { name: "ノートブックへ移動" }).click();
  return page.getByRole("dialog", { name: "移動先のノートブックを選択" });
}

// ダイアログの、ノートブック（または「未指定」）の行。
function notebookChoice(dialog: Locator, name: string) {
  return dialog.locator(".notebook-choice", { has: dialog.page().locator(".nav-label", { hasText: new RegExp(`^${name}$`) }) });
}

// メモの上に並ぶ、入っているノートブックの印（タグなどのチップは除く）。
function notebookChipsOfNote(page: Page) {
  return page.locator(".document-meta .chip", { has: page.locator(".dot, .notebook-icon") });
}

async function sortedTexts(chips: ReturnType<typeof notebookChipsOfNote>) {
  return (await chips.allTextContents()).sort();
}

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

test("ゴミ箱の自動削除は、既定ではオフ。日数は Enter か「保存」で決まり、いま消えるメモがあれば件数を出して確かめる", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-11-01T09:00:00+09:00") });
  await startLocalVault(page);
  await page.getByRole("button", { name: "新しいメモ" }).click();
  await page.getByPlaceholder("タイトル").fill("捨てるメモ");
  await page.getByRole("button", { name: "その他の操作" }).click();
  await page.getByRole("menuitem", { name: "ゴミ箱に移動" }).click();
  const trashCount = page.locator(".nav-row", { hasText: "ゴミ箱" }).locator(".count");
  await expect(trashCount).toHaveText("1");

  // 入れた直後は、30 日を過ぎたメモが無いので、聞かずに有効になる。
  await openSettingsPage(page, "一般");
  const autoDelete = page.getByLabel("ゴミ箱のメモを一定の日数後に完全に削除する");
  await expect(autoDelete).not.toBeChecked();
  await autoDelete.check();
  await expect(page.getByText("現在の設定は30日です")).toBeVisible();
  const days = page.getByLabel("ゴミ箱に残す日数");
  await days.fill("0");
  await expect(page.getByRole("alert")).toContainText("1〜3650の整数");

  // 捨ててから 5 日後。打っただけ・欄を離れただけでは決まらない（「365」と打つ途中の「3」で消えないように）。
  await page.clock.fastForward(5 * 24 * 60 * 60 * 1000);
  await days.fill("3");
  await days.blur();
  await page.clock.runFor(1_000);
  await expect(page.getByText("現在の設定は30日です")).toBeVisible();
  await expect(trashCount).toHaveText("1");

  // 「3」を Enter で決めようとすると、いま消える 1 件を出して確かめる。やめれば決まらず、メモも残る。
  await days.press("Enter");
  const confirmRemoval = page.getByRole("dialog", { name: /3日を過ぎたメモが1件あり/ });
  await confirmRemoval.getByRole("button", { name: "キャンセル" }).click();
  await expect(page.getByText("現在の設定は30日です")).toBeVisible();
  await expect(trashCount).toHaveText("1");

  // 消えるメモの無い日数は、聞かずに決まる。
  await days.fill("7");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.getByText("現在の設定は7日です")).toBeVisible();
  await page.clock.runFor(1_000);
  // まだ 7 日たっていないので残る。
  await expect(trashCount).toHaveText("1");

  await page.clock.fastForward(3 * 24 * 60 * 60 * 1000);
  await page.reload();
  await page.getByLabel("パスフレーズ").fill("correct horse battery");
  await page.getByRole("button", { name: "解除" }).click();
  await expect(page.locator(".nav-row", { hasText: "ゴミ箱" }).locator(".count")).toHaveCount(0);
});

test("プロパティの名前は Enter か「保存」で決まる。決めずに閉じるときと、消すときは確かめる", async ({ page }) => {
  await startLocalVault(page);
  await addNotebookOnDesktop(page, "読書");
  await page.locator(".nav-row", { has: page.locator(".nav", { hasText: "読書" }) }).getByRole("button", { name: "その他の操作" }).click();
  await page.getByRole("menuitem", { name: "プロパティ" }).click();
  const dialog = page.getByRole("dialog", { name: "プロパティ" });
  await dialog.getByRole("button", { name: "プロパティを追加" }).click();
  const name = dialog.getByRole("textbox", { name: "名前" });
  await name.fill("著者");

  // 決めずに閉じようとすると聞かれる。やめれば、打った名前は残る。
  await dialog.getByRole("button", { name: "閉じる" }).click();
  const discard = page.getByRole("dialog", { name: /保存していない名前や選択肢があります/ });
  await discard.getByRole("button", { name: "キャンセル" }).click();
  await expect(name).toHaveValue("著者");
  await name.press("Enter");
  await expect(dialog.getByRole("button", { name: "保存", exact: true })).toBeDisabled();

  // 消すときは聞かれる。やめれば残り、消すと決めれば消える。
  await dialog.getByRole("button", { name: "プロパティ「著者」を削除" }).click();
  const confirmRemoval = page.getByRole("dialog", { name: /プロパティ「著者」を削除しますか/ });
  await confirmRemoval.getByRole("button", { name: "キャンセル" }).click();
  await expect(name).toHaveValue("著者");
  await dialog.getByRole("button", { name: "プロパティ「著者」を削除" }).click();
  await confirmRemoval.getByRole("button", { name: "削除" }).click();
  await expect(dialog.getByText("プロパティはまだありません")).toBeVisible();
});

test("ノートブックにプロパティを決めると、その中のメモに値を入れる欄が出て、開き直しても値が残る", async ({ page }) => {
  await startLocalVault(page);
  await addNotebookOnDesktop(page, "読書");
  await page.locator(".nav-row", { has: page.locator(".nav", { hasText: "読書" }) }).getByRole("button", { name: "その他の操作" }).click();
  await page.getByRole("menuitem", { name: "プロパティ" }).click();
  const dialog = page.getByRole("dialog", { name: "プロパティ" });
  await dialog.getByRole("button", { name: "プロパティを追加" }).click();
  await dialog.getByRole("textbox", { name: "名前" }).fill("状態");
  await dialog.getByRole("textbox", { name: "名前" }).press("Enter");
  await dialog.getByRole("combobox", { name: "種類" }).selectOption("select");
  await addPropertyOptions(dialog, ["未読", "読了"]);
  await dialog.getByRole("button", { name: "プロパティを追加" }).click();
  await dialog.getByRole("textbox", { name: "名前" }).last().fill("ページ数");
  await dialog.getByRole("button", { name: "保存" }).click();
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
  await dialog.getByRole("textbox", { name: "名前" }).press("Enter");
  await dialog.getByRole("combobox", { name: "種類" }).selectOption("select");
  await addPropertyOptions(dialog, ["未読", "読了"]);
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

// ノートブックの右クリックのメニューから、データベース表示を開く。
async function openDatabaseView(page: Page, notebookName: string) {
  await notebookRow(page, notebookName).locator(".nav").click({ button: "right" });
  await page.getByRole("menuitem", { name: "データベース表示" }).click();
  return page.locator(".database-view");
}

test("データベース表示の表では、キーボードだけで、下の「新しいメモ」から行を続けて足し、右端の「＋」からプロパティを足せる", async ({ page }) => {
  await startLocalVault(page);
  await addNotebookOnDesktop(page, "読書");
  const database = await openDatabaseView(page, "読書");
  // メモが無いノートブックでも、表と「新しいメモ」が出る。
  await expect(database.locator("tbody tr")).toHaveCount(0);
  const newNoteButton = database.getByRole("button", { name: "新しいメモ" });
  const titleInput = database.getByPlaceholder("タイトル");

  await newNoteButton.focus();
  for (const title of ["坊っちゃん", "こころ"]) {
    await page.keyboard.press("Enter");
    await expect(titleInput).toBeFocused();
    await page.keyboard.type(title);
    await page.keyboard.press("Enter");
    // 決めたら「新しいメモ」へフォーカスが戻り、そのまま次の行を足せる。
    await expect(newNoteButton).toBeFocused();
  }
  // Escape では作らない。
  await page.keyboard.press("Enter");
  await page.keyboard.type("やめるメモ");
  await page.keyboard.press("Escape");
  await expect(newNoteButton).toBeFocused();
  await expect(database.locator("tbody tr .database-title")).toHaveText(["こころ", "坊っちゃん"]);
  // 足した行のメモは、このノートブックに入っている。
  await expect(notebookRow(page, "読書").locator(".count")).toHaveText("2");

  // 右端の「＋」は、プロパティのダイアログを「プロパティを追加」にフォーカスを置いて開く。足すと名前の欄が選ばれ、打つと名前が入れ替わる。
  await database.getByRole("button", { name: "プロパティを追加" }).focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "プロパティ" });
  await expect(dialog.getByRole("button", { name: "プロパティを追加" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(dialog.getByRole("textbox", { name: "名前" })).toBeFocused();
  await page.keyboard.type("著者");
  await expect(dialog.getByRole("textbox", { name: "名前" })).toHaveValue("著者");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(database.getByRole("columnheader", { name: "著者" })).toBeVisible();
  await database.locator("tbody tr", { hasText: "こころ" }).getByRole("textbox", { name: "著者" }).fill("夏目漱石");
  await expect(database.locator("tbody tr", { hasText: "こころ" }).getByRole("textbox", { name: "著者" })).toHaveValue("夏目漱石");
});

test("プロパティの選択肢は 1 つずつのチップで、名前を変えるとその値のメモも書き換わり、消しても「元に戻す」で戻せる。足した行は決めるまで記録に書かない", async ({ page }) => {
  await startLocalVault(page);
  await addNotebookOnDesktop(page, "読書");
  const database = await openDatabaseView(page, "読書");
  await database.getByRole("button", { name: "プロパティを追加" }).click();
  const dialog = page.getByRole("dialog", { name: "プロパティ" });
  await dialog.getByRole("button", { name: "プロパティを追加" }).click();
  // 決めていない行があるうちにもう一度押しても、行は増えず（仮の名前のまま記録に書かず）、その行の名前の欄へ戻る。
  await dialog.getByRole("button", { name: "プロパティを追加" }).click();
  await expect(dialog.getByRole("textbox", { name: "名前" })).toHaveCount(1);
  await expect(dialog.getByRole("textbox", { name: "名前" })).toBeFocused();
  // 決める前に行を消すと、何も残らない。
  await dialog.getByRole("button", { name: "プロパティ「新しいプロパティ」を削除" }).click();
  await expect(dialog.getByText("プロパティはまだありません")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "閉じる" })).toHaveClass(/primary-button/);

  await dialog.getByRole("button", { name: "プロパティを追加" }).click();
  await dialog.getByRole("textbox", { name: "名前" }).fill("状態");
  await dialog.getByRole("combobox", { name: "種類" }).selectOption("select");
  await addPropertyOptions(dialog, ["未読", "読了"]);
  await expect(dialog.locator(".property-option-name")).toHaveText(["未読", "読了"]);
  await dialog.getByRole("textbox", { name: "名前" }).press("Enter");
  await dialog.getByRole("button", { name: "閉じる" }).click();

  await database.getByRole("radio", { name: "ボード" }).click();
  const column = (name: string) => database.getByRole("region", { name });
  await column("読了").getByRole("button", { name: "新しいメモ" }).click();
  await column("読了").getByPlaceholder("タイトル").fill("こころ");
  await column("読了").getByPlaceholder("タイトル").press("Enter");
  await expect(column("読了").locator(".database-card")).toHaveText(["こころ"]);

  // 名前を変えると、その値を入れたメモも新しい列へ移る。
  await page.locator(".nav", { hasText: "読書" }).first().click({ button: "right" });
  await page.getByRole("menuitem", { name: "プロパティ" }).click();
  await dialog.locator(".property-option-name", { hasText: "読了" }).click();
  await dialog.getByRole("textbox", { name: "選択肢「読了」の名前を変更" }).fill("読み終えた");
  await page.keyboard.press("Enter");
  await expect(dialog.locator(".property-option-name")).toHaveText(["未読", "読み終えた"]);
  await expect(column("読み終えた").locator(".database-card")).toHaveText(["こころ"]);

  // 消すと列も消え、「元に戻す」で元の位置に戻る。
  await dialog.getByRole("button", { name: "選択肢「未読」を削除" }).click();
  await expect(dialog.locator(".property-option-name")).toHaveText(["読み終えた"]);
  await page.getByRole("status").filter({ hasText: "選択肢「未読」を削除しました" }).getByRole("button", { name: "元に戻す" }).click();
  await expect(dialog.locator(".property-option-name")).toHaveText(["未読", "読み終えた"]);
});

test("ボードのカードをドラッグすると、持っているカードが薄くなり、落とし先の列が光る。落とすとその列へ移る", async ({ page }) => {
  await startLocalVault(page);
  await addNotebookOnDesktop(page, "読書");
  const database = await openDatabaseView(page, "読書");
  await database.getByRole("button", { name: "プロパティを追加" }).click();
  const dialog = page.getByRole("dialog", { name: "プロパティ" });
  await dialog.getByRole("button", { name: "プロパティを追加" }).click();
  await dialog.getByRole("textbox", { name: "名前" }).fill("状態");
  await dialog.getByRole("combobox", { name: "種類" }).selectOption("select");
  await addPropertyOptions(dialog, ["未読", "読了"]);
  await dialog.getByRole("textbox", { name: "名前" }).press("Enter");
  await dialog.getByRole("button", { name: "閉じる" }).click();
  await database.getByRole("radio", { name: "ボード" }).click();
  const column = (name: string) => database.getByRole("region", { name });
  await column("未読").getByRole("button", { name: "新しいメモ" }).click();
  await column("未読").getByPlaceholder("タイトル").fill("こころ");
  await column("未読").getByPlaceholder("タイトル").press("Enter");

  const card = column("未読").locator(".database-card", { hasText: "こころ" });
  await card.hover();
  await page.mouse.down();
  const target = (await column("読了").boundingBox())!;
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 8 });
  await expect(card).toHaveClass(/dragging/);
  await expect(column("読了")).toHaveClass(/drop-target/);
  await expect(column("未読")).not.toHaveClass(/drop-target/);
  await page.mouse.up();
  await expect(column("読了").locator(".database-card")).toHaveText(["こころ"]);
  await expect(database.locator(".drop-target")).toHaveCount(0);
});

test("データベース表示のボードでは、列の下の「新しいメモ」から、その列の選択肢の値を入れたメモを作れる", async ({ page }) => {
  await startLocalVault(page);
  await addNotebookOnDesktop(page, "読書");
  const database = await openDatabaseView(page, "読書");
  await database.getByRole("button", { name: "プロパティを追加" }).click();
  const dialog = page.getByRole("dialog", { name: "プロパティ" });
  await dialog.getByRole("button", { name: "プロパティを追加" }).click();
  await dialog.getByRole("textbox", { name: "名前" }).fill("状態");
  await dialog.getByRole("textbox", { name: "名前" }).press("Enter");
  await dialog.getByRole("combobox", { name: "種類" }).selectOption("select");
  await addPropertyOptions(dialog, ["未読", "読了"]);
  await dialog.getByRole("button", { name: "閉じる" }).click();

  await database.getByRole("radio", { name: "ボード" }).click();
  const column = (name: string) => database.getByRole("region", { name });
  await column("読了").getByRole("button", { name: "新しいメモ" }).click();
  await column("読了").getByPlaceholder("タイトル").fill("こころ");
  await column("読了").getByPlaceholder("タイトル").press("Enter");
  // 決めた Enter で、戻ったフォーカスの先の「新しいメモ」をもう一度押したことにならない。
  await expect(column("読了").getByPlaceholder("タイトル")).toHaveCount(0);
  await expect(column("読了").getByRole("button", { name: "新しいメモ" })).toBeFocused();
  // 値の無い「未設定」の列からは、値を入れずに作る。欄の外を押しても決まり、フォーカスは押した先に残る。
  await column("未設定").getByRole("button", { name: "新しいメモ" }).click();
  await column("未設定").getByPlaceholder("タイトル").fill("門");
  await database.getByRole("radio", { name: "ボード" }).click();
  await expect(database.getByRole("radio", { name: "ボード" })).toBeFocused();
  await expect(column("読了").locator(".database-card")).toHaveText(["こころ"]);
  await expect(column("未設定").locator(".database-card")).toHaveText(["門"]);
  await expect(column("未読").locator(".database-card")).toHaveCount(0);

  await column("読了").locator(".database-card").click();
  await expect(page.getByPlaceholder("タイトル")).toHaveValue("こころ");
  await expect(page.getByLabel("状態")).toHaveValue("読了");
  await expect(notebookChipsOfNote(page)).toHaveText(["読書"]);
});

test("メモの「…」の「ノートブックへ移動」では、入っているノートブックに印が付いた一覧が入れ子の字下げつきで開き、選ぶと 1 つのノートブックへ移る", async ({ page }) => {
  await startLocalVault(page);
  await addNotebookOnDesktop(page, "仕事");
  await addNotebookOnDesktop(page, "旅行");
  await notebookRow(page, "仕事").hover();
  await notebookRow(page, "仕事").getByRole("button", { name: "その他の操作" }).click();
  await page.getByRole("menuitem", { name: "中にノートブックを追加" }).click();
  await page.getByPlaceholder("ノートブックの名前").fill("会議");
  await page.getByPlaceholder("ノートブックの名前").press("Enter");
  // 「旅行」を開いて作ったメモは、「旅行」に入る。
  await notebookRow(page, "旅行").locator(".nav").click();
  await createNoteOnDesktop(page, "持ち物");
  const chips = notebookChipsOfNote(page);
  await expect(chips).toHaveText(["旅行"]);

  const dialog = await openNotebookPicker(page);
  // 最後に、どのノートブックにも入れない「未指定」を出す。
  await expect(dialog.locator(".notebook-choice .nav-label")).toHaveText(["仕事", "会議", "旅行", "未指定"]);
  await expect(notebookChoice(dialog, "旅行")).toHaveAttribute("aria-current", "true");
  await expect(dialog.locator(".notebook-choice[aria-current]")).toHaveCount(1);
  // 子は親より右に字下げする。
  const parentLeft = (await notebookChoice(dialog, "仕事").locator(".nav-label").boundingBox())!.x;
  const childLeft = (await notebookChoice(dialog, "会議").locator(".nav-label").boundingBox())!.x;
  expect(childLeft).toBeGreaterThan(parentLeft);

  // 名前で絞り込むと、当たった子の親も残す。絞り込んでいる間は「未指定」を出さない。
  const search = dialog.getByPlaceholder("ノートブックを名前で絞り込む");
  await search.fill("会議");
  await expect(dialog.locator(".notebook-choice .nav-label")).toHaveText(["仕事", "会議"]);
  await search.fill("無い名前");
  await expect(dialog.getByText("一致するノートブックがありません")).toBeVisible();
  await search.fill("");

  // 選ぶと、そのノートブックへ移して閉じる（元の「旅行」からは出る）。
  await notebookChoice(dialog, "会議").click();
  await expect(dialog).toHaveCount(0);
  await expect(chips).toHaveText(["会議"]);
  await expect(notebookRow(page, "旅行").locator(".count")).toHaveCount(0);

  // 「未指定」を選ぶと、どのノートブックにも入っていないメモになる。
  const reopened = await openNotebookPicker(page);
  await expect(notebookChoice(reopened, "会議")).toHaveAttribute("aria-current", "true");
  await notebookChoice(reopened, "未指定").click();
  await expect(chips).toHaveCount(0);
  await expect(notebookRow(page, "未指定").locator(".count")).toHaveText("1");
});

test("ノートブックを選ぶダイアログは、キーボードだけで絞り込み・移動・閉じるができる", async ({ page }) => {
  await startLocalVault(page);
  await addNotebookOnDesktop(page, "仕事");
  await addNotebookOnDesktop(page, "旅行");
  await notebookRow(page, "すべてのメモ").locator(".nav").click();
  await createNoteOnDesktop(page, "持ち物");

  const dialog = await openNotebookPicker(page);
  const search = dialog.getByPlaceholder("ノートブックを名前で絞り込む");
  await expect(search).toBeFocused();
  await page.keyboard.type("旅");
  await page.keyboard.press("Tab");
  await expect(notebookChoice(dialog, "旅行")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(dialog).toHaveCount(0);
  await expect(notebookChipsOfNote(page)).toHaveText(["旅行"]);

  // 全部のノートブックと「未指定」を Tab で順にたどり、最後に「閉じる」へ移る。Escape では移さずに閉じる。
  const reopened = await openNotebookPicker(page);
  for (const name of ["仕事", "旅行", "未指定"]) {
    await page.keyboard.press("Tab");
    await expect(notebookChoice(reopened, name)).toBeFocused();
  }
  await page.keyboard.press("Tab");
  await expect(reopened.getByRole("button", { name: "閉じる" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(reopened).toHaveCount(0);
  await expect(notebookChipsOfNote(page)).toHaveText(["旅行"]);
});

test("ノートブックを選ぶダイアログでは、↓ で一覧へ移って ↑↓ で移れ、一覧に無い名前を打てば作成して移動できる", async ({ page }) => {
  await startLocalVault(page);
  await addNotebookOnDesktop(page, "仕事");
  await addNotebookOnDesktop(page, "旅行");
  await notebookRow(page, "すべてのメモ").locator(".nav").click();
  await createNoteOnDesktop(page, "持ち物");

  const dialog = await openNotebookPicker(page);
  await page.keyboard.press("ArrowDown");
  await expect(notebookChoice(dialog, "仕事")).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(notebookChoice(dialog, "旅行")).toBeFocused();
  await page.keyboard.press("Home");
  await expect(notebookChoice(dialog, "仕事")).toBeFocused();

  // 一覧に無い名前を打つと、その名前で作って、このメモを移す行が出る。
  await dialog.getByPlaceholder("ノートブックを名前で絞り込む").focus();
  await page.keyboard.type("買い物");
  await expect(dialog.getByText("一致するノートブックがありません")).toBeVisible();
  await page.keyboard.press("ArrowDown");
  const create = dialog.getByRole("button", { name: "「買い物」を作成して移動" });
  await expect(create).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(dialog).toHaveCount(0);
  await expect(notebookChipsOfNote(page)).toHaveText(["買い物"]);
  await expect(notebookRow(page, "買い物")).toBeVisible();
});

test("ノートブックが多くても、選ぶダイアログは画面の中に収まって一覧だけを送り、スマホの幅でも横にはみ出さない", async ({ page }) => {
  await startLocalVault(page);
  const longName = "とても長い名前のノートブック".repeat(4);
  const names = [...Array.from({ length: 30 }, (_, index) => `ノート ${String(index + 1).padStart(2, "0")}`), longName];
  for (const name of names) {
    await addNotebookOnDesktop(page, name);
  }
  await notebookRow(page, "すべてのメモ").locator(".nav").click();
  await createNoteOnDesktop(page, "持ち物");

  const expectDialogFitsViewport = async () => {
    const dialog = await openNotebookPicker(page);
    const viewport = page.viewportSize()!;
    const dialogBox = (await dialog.boundingBox())!;
    expect(dialogBox.y).toBeGreaterThanOrEqual(0);
    expect(dialogBox.y + dialogBox.height).toBeLessThanOrEqual(viewport.height);
    expect(dialogBox.x).toBeGreaterThanOrEqual(0);
    expect(dialogBox.x + dialogBox.width).toBeLessThanOrEqual(viewport.width);
    await expect(dialog.getByRole("button", { name: "閉じる" })).toBeInViewport();
    // 一覧は枠の中で送る。
    expect(await dialog.locator(".note-picker-list").evaluate((list) => list.scrollHeight > list.clientHeight)).toBe(true);
    // 長い名前は行の中で省略し、行も一覧も横にはみ出さない。
    const longRow = dialog.locator(".notebook-choice", { hasText: "とても長い名前" });
    expect(await longRow.evaluate((row) => row.scrollWidth <= row.clientWidth)).toBe(true);
    expect(await longRow.locator(".nav-label").evaluate((label) => label.scrollWidth > label.clientWidth)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    return dialog;
  };

  const desktopDialog = await expectDialogFitsViewport();
  // 一覧の下の方のノートブックも、送って選べる。
  await notebookChoice(desktopDialog, "ノート 30").click();
  await expect(notebookChipsOfNote(page)).toHaveText(["ノート 30"]);

  await page.setViewportSize(PHONE_VIEWPORT);
  const phoneDialog = await expectDialogFitsViewport();
  await expect(notebookChoice(phoneDialog, "ノート 30")).toHaveAttribute("aria-current", "true");
});

test("ゴミ箱の行のメニューから、件数を確かめてゴミ箱を空にできる", async ({ page }) => {
  await startLocalVault(page);
  for (const title of ["捨てる一", "捨てる二"]) {
    await createNoteOnDesktop(page, title);
    await page.getByRole("button", { name: "その他の操作" }).click();
    await page.getByRole("menuitem", { name: "ゴミ箱に移動" }).click();
  }
  await createNoteOnDesktop(page, "残すメモ");
  const trashRow = page.locator(".nav-row", { hasText: "ゴミ箱" });
  await expect(trashRow.locator(".count")).toHaveText("2");

  // やめると、何も消えない。
  await trashRow.hover();
  await page.getByRole("button", { name: "ゴミ箱の操作" }).click();
  await page.getByRole("menuitem", { name: "ゴミ箱を空にする（2件）" }).click();
  const confirmation = page.getByRole("dialog").filter({ hasText: "ゴミ箱のメモ2件を完全に削除しますか？" });
  await confirmation.getByRole("button", { name: "キャンセル" }).click();
  await expect(trashRow.locator(".count")).toHaveText("2");

  await trashRow.hover();
  await page.getByRole("button", { name: "ゴミ箱の操作" }).click();
  await page.getByRole("menuitem", { name: "ゴミ箱を空にする（2件）" }).click();
  await confirmation.getByRole("button", { name: "完全に削除" }).click();
  await expect(trashRow.locator(".count")).toHaveCount(0);
  await expect(page.getByRole("status").filter({ hasText: "2件のメモを完全に削除しました" })).toBeVisible();
  await expect(page.locator(".sidebar .tree-note", { hasText: "残すメモ" })).toHaveCount(1);
});

test("選択肢のプロパティが無いノートブックをボードにすると、案内の下の「プロパティを追加」からプロパティのダイアログを開ける", async ({ page }) => {
  await startLocalVault(page);
  await addNotebookOnDesktop(page, "読書");
  const database = await openDatabaseView(page, "読書");
  await database.getByRole("radio", { name: "ボード" }).click();
  await expect(database.getByText("ボード表示には、セレクトのプロパティが必要です。")).toBeVisible();
  await database.getByRole("button", { name: "プロパティを追加" }).click();
  await expect(page.getByRole("dialog", { name: "プロパティ" })).toBeVisible();
});
