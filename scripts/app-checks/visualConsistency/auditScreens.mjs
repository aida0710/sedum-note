// 見た目を測る画面の一覧と、そこまでの開き方。上から順に開くので、前の画面で作ったもの（メモ、ノートブック）を後の画面が使う。
// 1 つの画面は { name, open(page, { captureScreen }), close?(page), capturesItself? }。
// open が自分で撮る（スクロールして何枚か撮る）ときは capturesItself を true にする。

// 見た目を確かめるメモの本文。書式とブロックの種類をひととおり入れる（Markdown を貼ると書式になる）。
const RICH_NOTE_TITLE = "見た目の確認";
const RICH_NOTE_MARKDOWN = [
  "## 見出し 2 の行",
  "本文の段落。**太字**、*斜体*、==ハイライト==、`コード`、[リンク](https://example.com)、脚注[^1]、数式 $x^2 + y^2$。",
  "### 見出し 3 の行",
  "- 箇条書き 1",
  "  - 入れ子の項目",
  "- 箇条書き 2",
  "",
  "1. 番号付き 1",
  "2. 番号付き 2",
  "",
  "- [ ] チェックリスト（未完了）",
  "- [x] チェックリスト（完了）",
  "",
  "> 引用の段落。",
  "",
  "> [!note]",
  "> コールアウト（情報）の本文。",
  "",
  "> [!warning]",
  "> コールアウト（注意）の本文。",
  "",
  "| 項目 | 数 | メモ |",
  "|:--|--:|:-:|",
  "| りんご | 3 | 赤い |",
  "| みかん | 12 | 甘い |",
  "",
  "```js",
  "const greeting = \"hello\";",
  "console.log(greeting);",
  "```",
  "",
  "$$",
  "\\int_0^1 x^2 \\, dx = \\frac{1}{3}",
  "$$",
  "",
  "```mermaid",
  "graph LR",
  "  A[はじめ] --> B[おわり]",
  "```",
  "",
  "---",
  "",
  "#### 見出し 4 の行",
  "最後の段落。",
  "",
  "[^1]: 脚注の文。",
].join("\n");

// 添付の見本。画像は 1 画素の PNG を引き伸ばしたもの、PDF は 1 ページだけの最小のもの。
const SAMPLE_IMAGE = { name: "photo.png", mimeType: "image/png", buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkqPpfDwAE/wH+7ZJr2gAAAABJRU5ErkJggg==", "base64") };
const SAMPLE_TEXT_FILE = { name: "memo.txt", mimeType: "text/plain", buffer: Buffer.from("添付のテキスト") };
const SAMPLE_PDF = {
  name: "document.pdf", mimeType: "application/pdf",
  buffer: Buffer.from("%PDF-1.4\n1 0 obj <</Type/Catalog/Pages 2 0 R>> endobj\n2 0 obj <</Type/Pages/Kids[3 0 R]/Count 1>> endobj\n3 0 obj <</Type/Page/Parent 2 0 R/MediaBox[0 0 200 100]>> endobj\ntrailer <</Root 1 0 R>>\n%%EOF\n"),
};

const SETTINGS_SCROLL_STEPS = 12;
const NOTE_SCROLL_STEPS = 6;

async function pasteMarkdown(page, markdown) {
  await page.locator(".ProseMirror").evaluate((editor, text) => {
    const clipboard = new DataTransfer();
    clipboard.setData("text/plain", text);
    editor.dispatchEvent(new ClipboardEvent("paste", { clipboardData: clipboard, bubbles: true, cancelable: true }));
  }, markdown);
}

// 縦に長い画面を、見えている高さずつスクロールしながら撮る。
async function captureWhileScrolling(page, captureScreen, { name, scrollContainer, maxSteps }) {
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
async function openSettingsOnDesktop(page, pageName) {
  await page.locator(".sidebar-footer").getByRole("button", { name: /^(設定|Settings)$/ }).click();
  await page.locator(".settings").waitFor();
  if (pageName) {
    await page.locator(".settings-navigation").getByRole("button", { name: pageName, exact: true }).click();
  }
}

// 設定のページを順に開き、ページごとにスクロールしながら撮る。
async function captureEverySettingsPage(page, captureScreen, name) {
  const pageButtons = page.locator(".settings-navigation .nav");
  for (let index = 0; index < await pageButtons.count(); index += 1) {
    await pageButtons.nth(index).click();
    await captureWhileScrolling(page, captureScreen, { name: `${name}-${index + 1}`, scrollContainer: ".settings-layout .document-scroll", maxSteps: SETTINGS_SCROLL_STEPS });
  }
}

async function chooseTheme(page, themeName) {
  await openSettingsOnDesktop(page, "外観");
  await page.getByRole("radio", { name: themeName, exact: true }).click();
}

async function openRichNote(page) {
  await page.getByRole("button", { name: RICH_NOTE_TITLE }).first().click();
  await page.locator(".ProseMirror").waitFor();
}

// エディタの最後の段落の末尾にカーソルを置く。
async function placeCursorAtEnd(page) {
  await page.locator(".ProseMirror").evaluate((editor) => editor.focus());
  await page.keyboard.press("Control+End");
}

async function openSlashMenu(page, filter = "") {
  await placeCursorAtEnd(page);
  await page.keyboard.press("Enter");
  await page.keyboard.type(`/${filter}`);
  await page.locator(".slash-menu").waitFor();
}

async function closeSlashMenu(page) {
  await page.keyboard.press("Escape");
  // 「/」と絞り込みの文字、足した空の段落を消す。
  const typed = await page.evaluate(() => window.getSelection()?.anchorNode?.textContent ?? "");
  for (let index = 0; index <= typed.length; index += 1) {
    await page.keyboard.press("Backspace");
  }
}

async function insertBySlash(page, filter) {
  await openSlashMenu(page, filter);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(300);
}

async function openEditorMoreMenu(page) {
  // PC ではツールバーの右端、スマホでは画面の上の列にある。
  await page.locator(".editor-bar, .phone-top").getByRole("button", { name: "その他の操作" }).first().click();
  await page.getByRole("menu").waitFor();
}

async function openNotebookMenu(page, notebookName) {
  const row = page.locator(".nav-row", { has: page.locator(".nav-label", { hasText: notebookName }) }).first();
  await row.hover();
  await row.getByRole("button", { name: "その他の操作" }).click();
  await page.getByRole("menu").waitFor();
}

// 左の列のメモの行の「…」を押す（「…」は行にマウスを乗せたときだけ出る）。
async function openSidebarNoteMenu(page, title) {
  const row = page.locator(".nav-row", { has: page.locator(".tree-note", { hasText: title }) }).first();
  await row.hover();
  await row.locator(".row-actions button").click();
  await page.getByRole("menu").waitFor();
}

async function unlock(page, passphrase) {
  await page.locator("input[type=password]").first().fill(passphrase);
  await page.locator("input[type=password]").first().press("Enter");
  await page.locator(".workspace, .phone").first().waitFor();
}

export function DESKTOP_SCREENS({ baseUrl, passphrase, themeName, fillSampleWorkspace }) {
  return [
    { name: "setup", open: async (page) => { await page.goto(baseUrl); await page.getByLabel("パスフレーズ", { exact: true }).waitFor(); } },
    {
      name: "setup-generated-passphrase",
      open: async (page) => { await page.getByRole("button", { name: "強いパスフレーズを生成" }).click(); },
    },
    {
      name: "setup-with-sync",
      open: async (page) => { await page.getByLabel("ほかのデバイスと同期する").check(); },
      close: async (page) => { await page.getByLabel("ほかのデバイスと同期する").uncheck(); },
    },
    {
      name: "workspace",
      open: async (page) => {
        await fillSampleWorkspace(page, baseUrl);
        if (themeName) {
          await chooseTheme(page, themeName);
        }
        await page.getByRole("button", { name: "沖縄旅行の持ち物" }).first().click();
      },
    },
    {
      name: "rich-note",
      capturesItself: true,
      open: async (page, { captureScreen }) => {
        await page.getByRole("button", { name: /^仕事/ }).first().click();
        const tabsBefore = await page.getByRole("tab").count();
        await page.getByRole("button", { name: "新しいメモ" }).click();
        await page.waitForFunction((count) => document.querySelectorAll('[role="tab"]').length > count, tabsBefore);
        await page.getByPlaceholder("タイトル").fill(RICH_NOTE_TITLE);
        await page.getByPlaceholder("タイトル").press("Enter");
        await pasteMarkdown(page, RICH_NOTE_MARKDOWN);
        await insertBySlash(page, "dangumi");
        await placeCursorAtEnd(page);
        await insertBySlash(page, "kueri");
        await placeCursorAtEnd(page);
        await insertBySlash(page, "umekomi");
        await page.keyboard.type("https://example.com/video");
        await page.keyboard.press("Enter");
        await page.waitForTimeout(1500);
        await captureWhileScrolling(page, captureScreen, { name: "rich-note", scrollContainer: ".document-scroll", maxSteps: NOTE_SCROLL_STEPS });
      },
    },
    {
      name: "attachments",
      capturesItself: true,
      open: async (page, { captureScreen }) => {
        await placeCursorAtEnd(page);
        await page.locator('input[type="file"][accept="image/*"]:not([capture])').setInputFiles(SAMPLE_IMAGE);
        await placeCursorAtEnd(page);
        await page.locator('input[type="file"]:not([accept])').setInputFiles([SAMPLE_TEXT_FILE, SAMPLE_PDF]);
        await page.locator(".attachment-file").last().waitFor();
        await page.getByRole("button", { name: `${SAMPLE_PDF.name} をプレビュー` }).click();
        await page.waitForTimeout(1500);
        await page.locator(".attachment-file").last().scrollIntoViewIfNeeded();
        await captureScreen("attachments");
      },
    },
    {
      name: "outline",
      open: async (page) => { await page.locator(".editor-bar").getByRole("button", { name: "目次" }).click(); },
      close: async (page) => { await page.locator(".editor-bar").getByRole("button", { name: "目次" }).click(); },
    },
    { name: "slash-menu", open: (page) => openSlashMenu(page), close: closeSlashMenu },
    {
      name: "highlight-menu",
      open: async (page) => { await page.locator(".editor-bar").getByRole("button", { name: "ハイライト" }).click(); },
    },
    {
      name: "text-color-menu",
      open: async (page) => { await page.locator(".editor-bar").getByRole("button", { name: "文字色" }).click(); },
    },
    {
      name: "table-menu",
      open: async (page) => {
        await page.locator(".ProseMirror td").first().click();
        await page.locator(".editor-bar").getByRole("button", { name: "表" }).click();
      },
    },
    {
      name: "prompt-dialog",
      open: async (page) => {
        await page.locator(".ProseMirror td").first().click();
        await page.locator(".editor-bar").getByRole("button", { name: "表" }).click();
        await page.getByRole("menuitem", { name: "この列で行をフィルター" }).click();
        await page.getByRole("dialog").waitFor();
      },
    },
    {
      name: "find-and-replace",
      open: async (page) => {
        await page.locator(".ProseMirror").click();
        await page.keyboard.press("Control+F");
        await page.keyboard.type("の");
        await page.getByRole("button", { name: "置換の欄を出す" }).click();
      },
    },
    {
      name: "find-regex-invalid",
      open: async (page) => {
        await page.locator(".ProseMirror").click();
        await page.keyboard.press("Control+R");
        await page.getByRole("button", { name: "正規表現で探す" }).click();
        await page.getByPlaceholder("このメモの中を検索").fill("(\\d+");
      },
      close: async (page) => {
        await page.getByRole("button", { name: "正規表現で探す" }).click();
        await page.keyboard.press("Escape");
      },
    },
    { name: "note-actions-menu", open: openEditorMoreMenu },
    {
      name: "page-align-right",
      open: async (page) => {
        await openEditorMoreMenu(page);
        await page.getByRole("group", { name: "本文の配置" }).getByRole("button", { name: "右寄せ" }).click();
      },
      close: async (page) => {
        await openEditorMoreMenu(page);
        await page.getByRole("group", { name: "本文の配置" }).getByRole("button", { name: "既定" }).click();
      },
    },
    {
      name: "note-history",
      open: async (page) => { await openEditorMoreMenu(page); await page.getByRole("menuitem", { name: "履歴" }).click(); },
    },
    {
      name: "merge-note-picker",
      open: async (page) => { await openEditorMoreMenu(page); await page.getByRole("menuitem", { name: "ほかのメモを結合" }).click(); },
    },
    {
      name: "note-link-picker",
      open: async (page) => { await insertBySlash(page, "link"); },
      close: async (page) => { await page.keyboard.press("Escape"); await page.keyboard.press("Backspace"); },
    },
    {
      name: "sidebar-note-menu",
      open: (page) => openSidebarNoteMenu(page, "読みたい本"),
    },
    { name: "notebook-menu", open: (page) => openNotebookMenu(page, "仕事") },
    {
      // ドラッグの途中。札（setDragImage）は画面の撮影に写らないので、元の行と落とし先の光り方だけを撮る。
      name: "dragging-note",
      open: async (page) => {
        const source = page.locator(".tree-note", { hasText: "読みたい本" }).first();
        const target = page.locator(".tree-note", { hasText: "沖縄旅行の持ち物" }).first();
        await source.hover();
        await page.mouse.down();
        const box = await target.boundingBox();
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 8 });
        await page.locator(".view-group.drop-target").waitFor();
      },
      close: async (page) => {
        // 落とさずに、左の列の外で離す（メモは動かさない）。
        await page.mouse.move(900, 400, { steps: 4 });
        await page.mouse.up();
      },
    },
    {
      name: "confirm-dialog",
      open: async (page) => {
        await openNotebookMenu(page, "料理");
        await page.getByRole("menuitem", { name: "ノートブックを削除" }).click();
        await page.getByRole("dialog").waitFor();
      },
    },
    {
      name: "notebook-appearance",
      open: async (page) => { await openNotebookMenu(page, "仕事"); await page.getByRole("menuitem", { name: "色とアイコン" }).click(); },
    },
    {
      name: "notebook-properties",
      open: async (page) => {
        await openNotebookMenu(page, "仕事");
        await page.getByRole("menuitem", { name: /プロパティ/ }).click();
        const dialog = page.getByRole("dialog");
        await dialog.getByRole("button", { name: "プロパティを追加" }).click();
        await dialog.getByRole("button", { name: "プロパティを追加" }).click();
        await dialog.getByLabel("種類").nth(1).selectOption({ label: "選択肢" });
        await dialog.getByLabel("選択肢").fill("未着手、進行中、完了");
        await dialog.getByLabel("選択肢").press("Tab");
      },
    },
    {
      name: "note-properties",
      open: async (page) => { await openRichNote(page); await page.locator(".note-properties").waitFor(); },
    },
    {
      name: "database-table",
      open: async (page) => { await openNotebookMenu(page, "仕事"); await page.getByRole("menuitem", { name: "データベース表示" }).click(); await page.locator(".database-view").waitFor(); },
    },
    {
      name: "database-board",
      open: async (page) => { await page.getByRole("radio", { name: "ボード" }).click(); },
    },
    {
      name: "command-palette",
      open: async (page) => { await openRichNote(page); await page.keyboard.press("Control+K"); await page.getByRole("dialog").waitFor(); },
    },
    {
      name: "command-palette-everything",
      open: async (page) => { await page.keyboard.press("Control+K"); await page.getByRole("dialog").waitFor(); await page.keyboard.type("の"); },
    },
    {
      name: "command-palette-commands",
      open: async (page) => { await page.keyboard.press("Control+K"); await page.getByRole("dialog").waitFor(); await page.keyboard.type(">"); },
    },
    { name: "graph", open: async (page) => { await page.keyboard.press("Control+Alt+G"); await page.waitForTimeout(800); } },
    {
      // AI を有効にしていない間の案内が出る。
      name: "ai-chat",
      open: async (page) => { await openRichNote(page); await page.keyboard.press("Control+Alt+A"); await page.locator(".ai-chat").waitFor(); },
      close: async (page) => { await page.keyboard.press("Control+Alt+A"); },
    },
    {
      name: "sidebar-search",
      open: async (page) => {
        await page.locator(".sidebar").getByRole("button", { name: "検索", exact: true }).click();
        await page.getByPlaceholder("メモを検索").fill("の");
      },
      close: async (page) => { await page.locator(".sidebar").getByRole("button", { name: "検索", exact: true }).click(); },
    },
    {
      name: "trash-toast",
      open: async (page) => {
        await openSidebarNoteMenu(page, "読みたい本");
        await page.getByRole("menuitem", { name: "ゴミ箱に入れる" }).click();
        await page.getByRole("button", { name: "元に戻す" }).waitFor();
      },
      close: async (page) => { await page.getByRole("button", { name: "元に戻す" }).click(); },
    },
    { name: "trash", open: async (page) => { await page.locator(".sidebar .nav", { hasText: "ゴミ箱" }).first().click(); } },
    {
      name: "trash-banner",
      open: async (page) => {
        await openSidebarNoteMenu(page, "引っ越しのやること");
        await page.getByRole("menuitem", { name: "ゴミ箱に入れる" }).click();
        // ゴミ箱の行は、押すたびに開け閉めする。前の画面で開いていれば、押すと閉じるので、メモが出るまで押す。
        const trashRow = page.locator(".sidebar .nav", { hasText: "ゴミ箱" }).first();
        const trashedNote = page.locator(".tree-note", { hasText: "引っ越しのやること" }).first();
        await trashRow.click();
        if (!(await trashedNote.isVisible())) {
          await trashRow.click();
        }
        await trashedNote.click();
        await page.locator(".trash-banner").waitFor();
      },
      close: async (page) => { await page.getByRole("button", { name: "ゴミ箱から戻す" }).click(); },
    },
    {
      name: "backlinks",
      open: async (page) => {
        // 見た目の確認のメモから、沖縄旅行の持ち物へリンクを張り、リンク先の下にバックリンクを出す。
        await openRichNote(page);
        await insertBySlash(page, "link");
        await page.getByRole("dialog").getByRole("button", { name: "沖縄旅行の持ち物" }).click();
        await page.getByRole("button", { name: "沖縄旅行の持ち物" }).first().click();
        await page.locator(".backlinks").scrollIntoViewIfNeeded();
      },
    },
    {
      name: "settings",
      capturesItself: true,
      open: async (page, { captureScreen }) => {
        await openSettingsOnDesktop(page);
        await captureEverySettingsPage(page, captureScreen, "settings");
      },
    },
    {
      name: "settings-ai-enabled",
      open: async (page) => {
        await openSettingsOnDesktop(page, "AI");
        await page.getByRole("checkbox", { name: "アプリ内の AI を使う" }).check();
        await page.getByLabel("つなぎ先").selectOption({ index: 1 });
      },
      close: async (page) => { await page.getByRole("checkbox", { name: "アプリ内の AI を使う" }).uncheck(); },
    },
    {
      name: "custom-theme-editor",
      open: async (page) => { await openSettingsOnDesktop(page, "外観"); await page.getByRole("button", { name: "テーマを作る" }).click(); },
    },
    {
      name: "settings-sync-fields",
      open: async (page) => {
        await openSettingsOnDesktop(page, "同期");
        const syncSetup = page.locator(".settings").getByRole("button", { name: /同期先を設定|同期を設定/ });
        if (await syncSetup.count()) {
          await syncSetup.first().click();
        }
        await page.getByLabel("エンドポイント").scrollIntoViewIfNeeded();
      },
    },
    {
      name: "focus-mode",
      open: async (page) => { await openRichNote(page); await page.keyboard.press("Control+Alt+F"); },
      close: async (page) => { await page.locator(".focus-mode-exit").click(); },
    },
    {
      name: "dark-theme",
      capturesItself: true,
      open: async (page, { captureScreen }) => {
        await chooseTheme(page, "ダーク");
        await openRichNote(page);
        await captureScreen("dark-rich-note");
        await page.locator(".mermaid-diagram").first().scrollIntoViewIfNeeded();
        await captureScreen("dark-diagram");
        await openSlashMenu(page);
        await captureScreen("dark-slash-menu");
        await closeSlashMenu(page);
        await openEditorMoreMenu(page);
        await captureScreen("dark-note-actions-menu");
        await page.keyboard.press("Escape");
        await openNotebookMenu(page, "仕事");
        await page.getByRole("menuitem", { name: "色とアイコン" }).click();
        await captureScreen("dark-notebook-appearance");
        await page.keyboard.press("Escape");
        await openSettingsOnDesktop(page, "同期");
        await captureScreen("dark-settings");
      },
      close: async (page) => { await page.keyboard.press("Escape"); await chooseTheme(page, themeName ?? "ライト"); },
    },
    {
      name: "unlock",
      open: async (page) => {
        await openSettingsOnDesktop(page, "セキュリティ");
        await page.locator(".settings").getByRole("button", { name: "ロック", exact: true }).click();
        await page.locator("input[type=password]").first().waitFor();
      },
      close: (page) => unlock(page, passphrase),
    },
  ];
}

// 英語の画面。道具の操作は日本語の文言に頼るので、ここでは文言を使わずに開ける画面だけを測る。
export function ENGLISH_SCREENS({ passphrase }) {
  const switchLanguage = async (page, language) => {
    await page.evaluate((chosen) => {
      const key = "sedum-note:devicePreferences";
      const stored = JSON.parse(localStorage.getItem(key) ?? "{}");
      localStorage.setItem(key, JSON.stringify({ ...stored, language: chosen }));
    }, language);
    await page.reload();
  };
  return [
    { name: "en-unlock", open: (page) => switchLanguage(page, "en"), close: (page) => unlock(page, passphrase) },
    { name: "en-workspace", open: async (page) => { await page.locator(".nav-row").first().waitFor(); } },
    {
      name: "en-note-actions-menu",
      open: async (page) => {
        await page.locator(".tree-note").first().click();
        await page.locator(".ProseMirror").waitFor();
        await page.locator(".editor-bar button[aria-haspopup=menu]").last().click();
        await page.getByRole("menu").waitFor();
      },
    },
    { name: "en-slash-menu", open: (page) => openSlashMenu(page), close: closeSlashMenu },
    {
      name: "en-settings",
      capturesItself: true,
      open: async (page, { captureScreen }) => {
        await openSettingsOnDesktop(page);
        await captureEverySettingsPage(page, captureScreen, "en-settings");
      },
      close: (page) => switchLanguage(page, "ja").then(() => unlock(page, passphrase)),
    },
  ];
}

export function PHONE_SCREENS({ baseUrl, passphrase }) {
  const selectPhoneTab = (page, name) => page.locator(".tabbar").getByRole("button", { name }).click();
  return [
    { name: "phone-setup", open: async (page) => { await page.goto(baseUrl); await page.getByLabel("パスフレーズ", { exact: true }).waitFor(); } },
    {
      name: "phone-note-list",
      open: async (page) => {
        await page.getByLabel("パスフレーズ", { exact: true }).fill(passphrase);
        await page.getByLabel("パスフレーズ（確認）").fill(passphrase);
        await page.getByRole("button", { name: "作成" }).click();
        await page.locator(".tabbar").waitFor();
        for (const title of ["買い物のメモ", "旅行の予定"]) {
          await page.locator(".fab").click();
          await page.getByPlaceholder("タイトル").fill(title);
          await page.getByPlaceholder("タイトル").press("Enter");
          await page.keyboard.type("本文の 1 行目。#todo");
          await page.getByRole("button", { name: "戻る" }).click();
        }
      },
    },
    { name: "phone-notebooks", open: (page) => selectPhoneTab(page, "ノートブック") },
    {
      name: "phone-editor",
      capturesItself: true,
      open: async (page, { captureScreen }) => {
        await selectPhoneTab(page, "メモ");
        await page.locator(".note-item").first().click();
        await page.locator(".ProseMirror").waitFor();
        await pasteMarkdown(page, RICH_NOTE_MARKDOWN);
        await page.waitForTimeout(800);
        await captureWhileScrolling(page, captureScreen, { name: "phone-editor", scrollContainer: ".document-scroll", maxSteps: NOTE_SCROLL_STEPS });
      },
    },
    { name: "phone-slash-menu", open: (page) => openSlashMenu(page), close: closeSlashMenu },
    {
      name: "phone-find-and-replace",
      open: async (page) => {
        await openEditorMoreMenu(page);
        await page.getByRole("menuitem", { name: "メモの中を検索" }).click();
        await page.getByPlaceholder("このメモの中を検索").fill("の");
        await page.getByRole("button", { name: "置換の欄を出す" }).click();
      },
      close: async (page) => { await page.locator(".find-bar").getByRole("button", { name: "閉じる" }).click(); },
    },
    {
      name: "phone-note-actions-menu",
      open: openEditorMoreMenu,
      close: async (page) => { await page.keyboard.press("Escape"); await page.getByRole("button", { name: "戻る" }).click(); },
    },
    {
      name: "phone-settings",
      capturesItself: true,
      open: async (page, { captureScreen }) => {
        await selectPhoneTab(page, "設定");
        await page.locator(".settings").waitFor();
        await captureScreen("phone-settings-pages");
        // ページの一覧から 1 つずつ開いて撮り、「設定」（戻る）で一覧へ戻る。
        const pageRows = page.locator(".settings-page-list .library-row");
        for (let index = 0; index < await pageRows.count(); index += 1) {
          await pageRows.nth(index).click();
          await captureWhileScrolling(page, captureScreen, { name: `phone-settings-${index + 1}`, scrollContainer: ".document-scroll", maxSteps: SETTINGS_SCROLL_STEPS });
          await page.locator(".phone-back").click();
        }
      },
    },
  ];
}
