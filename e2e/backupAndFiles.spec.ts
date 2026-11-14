import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { expect, type Page, test } from "@playwright/test";
import { PAGE_ORIGIN } from "./devServer";
import { insertFromSlashMenu, openSettingsPage } from "./devices";

const PASSPHRASE = "correct horse battery";

async function startLocalVault(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByLabel("パスフレーズ", { exact: true }).fill(PASSPHRASE);
  await page.getByLabel("パスフレーズ（確認）").fill(PASSPHRASE);
  await page.getByRole("button", { name: "作成" }).click();
  await page.getByRole("button", { name: "新しいメモ" }).click();
}

test("同期を設定しなくても、パスフレーズだけで始めてメモを書ける", async ({ page }) => {
  await startLocalVault(page);
  await page.getByPlaceholder("タイトル").fill("ローカルだけのメモ");
  await expect(page.getByText("同期は未設定")).toBeVisible();
  // 入力は 0.15 秒後に手元へ保存される。それより長く待ってから閉じる。
  await page.waitForTimeout(500);
  await page.reload();
  await page.getByLabel("パスフレーズ").fill(PASSPHRASE);
  await page.getByRole("button", { name: "解除" }).click();
  // ノートブックが無いうちは「すべてのメモ」が最初から開いている。
  await expect(page.getByRole("button", { name: "ローカルだけのメモ" })).toBeVisible();
});

test("写真以外のファイルを添付でき、保存すると同じ中身のファイルが得られる", async ({ page }) => {
  await startLocalVault(page);
  await page.getByPlaceholder("タイトル").fill("資料つき");
  await page.getByPlaceholder("タイトル").press("Enter");
  const contents = Buffer.from("%PDF-1.7 これは試験用の資料です\n".repeat(200));
  await page.locator('input[type="file"]:not([accept])').setInputFiles({ name: "見積書.pdf", mimeType: "application/pdf", buffer: contents });
  const fileNode = page.locator(".attachment-file");
  await expect(fileNode).toContainText("見積書.pdf");
  await expect(fileNode).toContainText("KB");

  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "見積書.pdfを保存" }).click();
  const saved = await download;
  expect(saved.suggestedFilename()).toBe("見積書.pdf");
  expect(await readFile(await saved.path())).toEqual(contents);
});

test("バックアップを書き出し、別のデバイスの最初の画面から戻せる", async ({ browser }) => {
  const source = await (await browser.newContext({ viewport: { width: 1280, height: 820 } })).newPage();
  await startLocalVault(source);
  await source.getByPlaceholder("タイトル").fill("バックアップするメモ");
  await source.getByPlaceholder("タイトル").press("Enter");
  await source.keyboard.type("戻ってくる本文");
  await source.locator('input[type="file"]:not([accept])').setInputFiles({ name: "memo.txt", mimeType: "text/plain", buffer: Buffer.from("添付の中身") });
  await expect(source.locator(".attachment-file")).toContainText("memo.txt");

  await openSettingsPage(source, "データ");
  const download = source.waitForEvent("download");
  await source.getByRole("button", { name: "バックアップをエクスポート" }).click();
  const backup = await download;
  expect(backup.suggestedFilename()).toMatch(/^sedum-note-backup-\d{8}\.sedumbackup$/);
  await expect(source.getByText("1件のメモをエクスポートしました")).toBeVisible();
  const backupPath = await backup.path();
  expect((await readFile(backupPath)).toString("latin1")).not.toMatch(/memo\.txt/);

  const target = await (await browser.newContext({ viewport: { width: 1280, height: 820 } })).newPage();
  await target.goto("/");
  await target.getByRole("tab", { name: "バックアップから復元" }).click();
  // ファイルは、アプリのボタンから選ぶ（ブラウザの既定のファイル選択は出さない）。選ぶと、ファイルの名前が横に出る。
  await expect(target.getByLabel("バックアップファイル")).toBeHidden();
  await expect(target.locator(".file-choice")).toHaveText("ファイルを選択選択されていません");
  const fileChooser = target.waitForEvent("filechooser");
  await target.getByRole("button", { name: "ファイルを選択" }).click();
  await (await fileChooser).setFiles(backupPath);
  await expect(target.locator(".file-choice-name")).toHaveText(basename(backupPath));
  await target.getByLabel("パスフレーズ", { exact: true }).fill("a wrong passphrase");
  await target.getByRole("button", { name: "復元" }).click();
  await expect(target.getByRole("alert")).toContainText("パスフレーズが正しくありません。");
  await target.getByLabel("パスフレーズ", { exact: true }).fill(PASSPHRASE);
  await target.getByRole("button", { name: "復元" }).click();

  await target.getByRole("button", { name: "バックアップするメモ" }).click();
  await expect(target.locator(".ProseMirror")).toContainText("戻ってくる本文");
  const restoredFile = target.waitForEvent("download");
  await target.getByRole("button", { name: "memo.txtを保存" }).click();
  expect((await readFile(await (await restoredFile).path())).toString()).toBe("添付の中身");
});

test("Markdown で書き出すと暗号化されないことを確かめられ、書き出した zip を別のデバイスに取り込める", async ({ browser }) => {
  const source = await (await browser.newContext({ viewport: { width: 1280, height: 820 } })).newPage();
  await startLocalVault(source);
  await source.getByPlaceholder("タイトル").fill("旅のメモ");
  await source.getByPlaceholder("タイトル").press("Enter");
  await source.keyboard.type("## 持ち物");
  await source.keyboard.press("Enter");
  await source.keyboard.type("日焼け止め");
  await source.locator('input[type="file"]:not([accept])').setInputFiles({ name: "memo.txt", mimeType: "text/plain", buffer: Buffer.from("添付の中身") });
  await expect(source.locator(".attachment-file")).toContainText("memo.txt");

  await openSettingsPage(source, "データ");
  await source.getByRole("button", { name: "すべてのメモをMarkdownでエクスポート" }).click();
  const confirmation = source.getByRole("dialog");
  await expect(confirmation).toContainText("エクスポートしたファイルは暗号化されない");
  const download = source.waitForEvent("download");
  await confirmation.getByRole("button", { name: "エクスポート" }).click();
  const exported = await download;
  expect(exported.suggestedFilename()).toMatch(/^sedum-note-markdown-\d{8}\.zip$/);
  await expect(source.getByText("1件のメモをエクスポートしました")).toBeVisible();

  const target = await (await browser.newContext({ viewport: { width: 1280, height: 820 } })).newPage();
  await target.goto("/");
  await target.getByLabel("パスフレーズ", { exact: true }).fill(PASSPHRASE);
  await target.getByLabel("パスフレーズ（確認）").fill(PASSPHRASE);
  await target.getByRole("button", { name: "作成" }).click();
  await openSettingsPage(target, "データ");
  await target.getByLabel("Markdownをインポート").setInputFiles(await exported.path());
  await expect(target.getByText("1件のメモをインポートしました")).toBeVisible();
  await target.getByRole("button", { name: "旅のメモ" }).click();
  await expect(target.locator(".ProseMirror h2")).toHaveText("持ち物");
  await expect(target.locator(".ProseMirror")).toContainText("日焼け止め");
  await expect(target.locator(".attachment-file")).toContainText("memo.txt");
});

test("強いパスフレーズを生成して始められ、生成したパスフレーズでロックを解除できる", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "強いパスフレーズを生成" }).click();
  const generated = (await page.getByRole("status").locator("code").textContent())!;
  expect(generated).toMatch(/^([0-9A-HJKMNP-TV-Z]{4}-){5}[0-9A-HJKMNP-TV-Z]{4}$/);
  await expect(page.getByLabel("パスフレーズ", { exact: true })).toHaveValue(generated);
  await expect(page.getByLabel("パスフレーズ（確認）")).toHaveValue(generated);
  // 手で直したら、生成した値の表示は消える（入力欄の中身と食い違うため）。
  await page.getByLabel("パスフレーズ", { exact: true }).fill(`${generated}x`);
  await expect(page.getByRole("status")).toHaveCount(0);
  await page.getByLabel("パスフレーズ", { exact: true }).fill(generated);

  await page.getByRole("button", { name: "作成" }).click();
  await page.getByRole("button", { name: "新しいメモ" }).waitFor();
  await page.reload();
  await page.getByLabel("パスフレーズ").fill(generated);
  await page.getByRole("button", { name: "解除" }).click();
  await expect(page.getByRole("button", { name: "新しいメモ" })).toBeVisible();
});

test("Web 版で同期を使うときは、最初の画面でバケットの CORS の設定を見られる", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("ほかのデバイスと同期する").check();
  await page.getByText("バケットのCORS設定").click();
  await expect(page.locator("details pre")).toContainText('"ExposeHeaders"');
  // 入れるのは、開いている Web 版の origin だけ（アプリは CORS の設定が要らない）。
  await expect(page.locator("details pre")).toContainText(PAGE_ORIGIN);
});

test("メモを HTML とテキストで書き出せる。HTML は書式と添付へのリンクを保ち、テキストは文字だけになる", async ({ page }) => {
  await startLocalVault(page);
  await page.getByPlaceholder("タイトル").fill("書き出しのメモ");
  await page.getByPlaceholder("タイトル").press("Enter");
  await page.keyboard.type("## 持ち物");
  await page.keyboard.press("Enter");
  await page.keyboard.type("日焼け止め");

  // メモの「…」の「書き出す」で、形式を選ぶダイアログが開く。暗号化されないことも、同じダイアログに出る。
  const exportAs = async (format: string) => {
    await page.getByRole("button", { name: "その他の操作" }).click();
    await page.getByRole("menuitem", { name: "エクスポート" }).click();
    const dialog = page.getByRole("dialog", { name: "メモをエクスポート" });
    await expect(dialog).toContainText("エクスポートしたファイルは暗号化されない");
    await dialog.getByRole("radio", { name: format }).click();
    await expect(dialog.getByRole("radio", { name: format })).toHaveAttribute("aria-checked", "true");
    const download = page.waitForEvent("download");
    await dialog.getByRole("button", { name: "エクスポート" }).click();
    const exported = await download;
    // 確認のダイアログは重ならない（形式を選んだダイアログの「書き出す」で、そのまま書き出す）。
    await expect(page.getByRole("dialog")).toHaveCount(0);
    return { fileName: exported.suggestedFilename(), text: await readFile(await exported.path(), "utf8") };
  };

  const html = await exportAs("HTML");
  expect(html.fileName).toBe("書き出しのメモ.html");
  expect(html.text).toContain("<h1>書き出しのメモ</h1>");
  expect(html.text).toContain("<h2>持ち物</h2>");
  expect(html.text).toContain("<p>日焼け止め</p>");

  const text = await exportAs("テキスト");
  expect(text.fileName).toBe("書き出しのメモ.txt");
  expect(text.text).toBe("書き出しのメモ\n\n持ち物\n日焼け止め\n");
});

// 2 ページの、最小の PDF。相互参照の表は付けていない（読む側が作り直す）。
function twoPagePdf(): Buffer {
  const objects = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj",
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>\nendobj",
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] >>\nendobj",
    "4 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] >>\nendobj",
  ];
  return Buffer.from(`%PDF-1.4\n${objects.join("\n")}\ntrailer\n<< /Root 1 0 R /Size 5 >>\n%%EOF\n`, "latin1");
}

test("添付した PDF は、メモの中でプレビューを開いて、ページを送り、拡大できる", async ({ page }) => {
  await startLocalVault(page);
  await page.getByPlaceholder("タイトル").fill("資料");
  await page.getByPlaceholder("タイトル").press("Enter");
  await page.locator('input[type="file"]:not([accept])').setInputFiles({ name: "資料.pdf", mimeType: "application/pdf", buffer: twoPagePdf() });
  await expect(page.locator(".attachment-file")).toContainText("資料.pdf");

  await page.getByRole("button", { name: "資料.pdfをプレビュー" }).click();
  const preview = page.locator(".pdf-preview");
  await expect(preview.locator(".pdf-page-number")).toHaveText("1 / 2");
  const canvasWidth = () => preview.locator("canvas").evaluate((canvas) => canvas.getBoundingClientRect().width);
  await expect.poll(canvasWidth).toBeGreaterThan(100);
  const fittedWidth = await canvasWidth();

  await preview.getByRole("button", { name: "次のページ" }).click();
  await expect(preview.locator(".pdf-page-number")).toHaveText("2 / 2");
  await expect(preview.getByRole("button", { name: "次のページ" })).toBeDisabled();
  await preview.getByRole("button", { name: "拡大" }).click();
  await expect.poll(canvasWidth).toBeGreaterThan(fittedWidth * 1.3);

  await page.getByRole("button", { name: "資料.pdfをプレビュー" }).click();
  await expect(preview).toHaveCount(0);
});

test("録音のボタンで録り始め、止めると音声が添付される。添付した音声は、その場で再生できる", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "マイクの代わりの音は、Chromium の AudioContext で作る");
  // マイクの代わりに、作った音（無音に近い波）を返す。
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      const context = new AudioContext();
      const destination = context.createMediaStreamDestination();
      const oscillator = context.createOscillator();
      oscillator.connect(destination);
      oscillator.start();
      return destination.stream;
    };
  });
  await startLocalVault(page);
  await page.getByPlaceholder("タイトル").fill("録音のメモ");
  await page.getByPlaceholder("タイトル").press("Enter");

  // PC では「/」から録音を始め、録音している間だけ上のバーに出る「録音を止めて添付する」で止める。
  await insertFromSlashMenu(page, "録音", "録音");
  const stopButton = page.getByRole("button", { name: "録音を停止して添付" });
  await expect(stopButton).toBeVisible();
  await page.waitForTimeout(600);
  await stopButton.click();
  const attachment = page.locator(".attachment-file");
  await expect(attachment).toContainText(/録音 \d{4}-\d{2}-\d{2} \d{2}\.\d{2}\.webm/);
  await expect(stopButton).toHaveCount(0);

  await attachment.getByRole("button", { name: /を再生$/ }).click();
  await expect(attachment.locator("audio")).toHaveAttribute("src", /^blob:/);
});

test("最初の画面で「新規設定」の入力の誤りを出したあと、「バックアップから復元」に切り替えると、誤りは消える", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("パスフレーズ", { exact: true }).fill("correct horse battery");
  await page.getByLabel("パスフレーズ（確認）").fill("a different passphrase");
  await page.getByRole("button", { name: "作成" }).click();
  await expect(page.getByRole("alert")).toHaveText("パスフレーズが一致しません。");
  await page.getByRole("tab", { name: "バックアップから復元" }).click();
  await expect(page.getByRole("alert")).toHaveCount(0);
});
