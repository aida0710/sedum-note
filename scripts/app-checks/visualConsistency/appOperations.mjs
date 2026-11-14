// 見た目を測る画面まで、アプリを動かす操作。auditScreens.mjs とほかの画面の一覧が共有する。
// 文言で探す操作は、日本語の画面を前提にする（英語の画面は auditScreens.mjs の ENGLISH_SCREENS が文言を使わずに開く）。

export const SETTINGS_SCROLL_STEPS = 12;

export async function pasteMarkdown(page, markdown) {
  await page.locator(".ProseMirror").first().evaluate((editor, text) => {
    const clipboard = new DataTransfer();
    clipboard.setData("text/plain", text);
    editor.dispatchEvent(new ClipboardEvent("paste", { clipboardData: clipboard, bubbles: true, cancelable: true }));
  }, markdown);
}

// 縦に長い画面を、見えている高さずつスクロールしながら撮る。
export async function captureWhileScrolling(page, captureScreen, { name, scrollContainer, maxSteps }) {
  const container = page.locator(scrollContainer).first();
  await container.evaluate((element) => { element.scrollTop = 0; });
  for (let step = 0; step < maxSteps; step += 1) {
    await captureScreen(`${name}-${step + 1}`);
    const moved = await container.evaluate((element) => {
      const before = element.scrollTop;
      element.scrollTop = before + element.clientHeight * 0.85;
      return element.scrollTop !== before;
    });
    if (!moved) break;
  }
  await container.evaluate((element) => { element.scrollTop = 0; });
}

// 左下の歯車から設定を開き、ページを選ぶ（ページの名前は左の一覧の文言）。
export async function openSettingsOnDesktop(page, pageName) {
  await page.locator(".sidebar-footer").getByRole("button", { name: /^(設定|Settings)$/ }).click();
  await page.locator(".settings").waitFor();
  if (pageName) {
    await page.locator(".settings-navigation").getByRole("button", { name: pageName, exact: true }).click();
  }
}

// 設定のページを順に開き、ページごとにスクロールしながら撮る。
export async function captureEverySettingsPage(page, captureScreen, name) {
  const pageButtons = page.locator(".settings-navigation .nav");
  for (let index = 0; index < await pageButtons.count(); index += 1) {
    await pageButtons.nth(index).click();
    await captureWhileScrolling(page, captureScreen, { name: `${name}-${index + 1}`, scrollContainer: ".settings-layout .document-scroll", maxSteps: SETTINGS_SCROLL_STEPS });
  }
}

export async function chooseTheme(page, themeName) {
  await openSettingsOnDesktop(page, "外観");
  await page.getByRole("radio", { name: themeName, exact: true }).click();
}

// エディタの最後の段落の末尾にカーソルを置く。ブラウザの Ctrl+End は、本文の後ろのほうに添付や埋め込み（文字を打てない要素）が
// 並ぶと、行き先がぶれる（図のコードの先頭に入ることがあった）。Tiptap がエディタの要素に付けるエディタ（.editor）で末尾へ移す。
// Tiptap の focus は、フォーカスを次の描画まで待つ。続けて打つ文字が本文に入るよう、その場でもフォーカスを移す。
export async function placeCursorAtEnd(page) {
  await page.locator(".ProseMirror").first().evaluate((element) => {
    element.editor.commands.focus("end");
    element.editor.view.focus();
  });
}

// 本文の最初の段落の文字を全部選ぶ。PC では、選んだ所の上に書式のボタン（.selection-toolbar）が出る。
export async function selectFirstParagraph(page) {
  await page.locator(".ProseMirror").first().evaluate((element) => {
    const { editor } = element;
    let range = null;
    editor.state.doc.descendants((node, position) => {
      if (range === null && node.type.name === "paragraph" && node.textContent.length > 0) {
        range = { from: position + 1, to: position + 1 + node.content.size };
      }
      return range === null;
    });
    editor.commands.setTextSelection(range);
    editor.view.focus();
  });
}

export async function openSlashMenu(page, filter = "") {
  await placeCursorAtEnd(page);
  await page.keyboard.press("Enter");
  await page.keyboard.type(`/${filter}`);
  await page.locator(".slash-menu").waitFor();
}

export async function closeSlashMenu(page) {
  await page.keyboard.press("Escape");
  // 「/」と絞り込みの文字、足した空の段落を消す。
  const typed = await page.evaluate(() => window.getSelection()?.anchorNode?.textContent ?? "");
  for (let index = 0; index <= typed.length; index += 1) {
    await page.keyboard.press("Backspace");
  }
}

export async function insertBySlash(page, filter) {
  await openSlashMenu(page, filter);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(300);
}

export async function openEditorMoreMenu(page) {
  // PC ではツールバーの右端、スマホでは画面の上の列にある。
  await page.locator(".editor-bar, .phone-top").getByRole("button", { name: "その他の操作" }).first().click();
  await page.getByRole("menu").waitFor();
}

export async function openNotebookMenu(page, notebookName) {
  const row = page.locator(".nav-row", { has: page.locator(".nav-label", { hasText: notebookName }) }).first();
  await row.scrollIntoViewIfNeeded();
  await row.hover();
  await row.getByRole("button", { name: "その他の操作" }).click();
  await page.getByRole("menu").waitFor();
}

// 左の列のメモの行の「…」を押す（「…」は行にマウスを乗せたときだけ出る）。
export async function openSidebarNoteMenu(page, title) {
  const row = page.locator(".nav-row", { has: page.locator(".tree-note", { hasText: title }) }).first();
  await row.scrollIntoViewIfNeeded();
  await row.hover();
  await row.locator(".row-actions button").click();
  await page.getByRole("menu").waitFor();
}

export async function unlock(page, passphrase) {
  await page.locator("input[type=password]").first().fill(passphrase);
  await page.locator("input[type=password]").first().press("Enter");
  await page.locator(".workspace, .phone").first().waitFor();
}

// 本文のブロックにポインターを乗せて、左に出る持ち手を押し、ブロックのメニューを開く。
export async function openBlockMenu(page, blockLocator) {
  await blockLocator.scrollIntoViewIfNeeded();
  await blockLocator.hover();
  await page.locator(".block-drag-handle").click();
  await page.getByRole("menu").waitFor();
}
