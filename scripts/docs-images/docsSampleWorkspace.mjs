// ドキュメントの画像を撮る前に、新しい vault に見本のノートブックとメモ（docsSampleNotes.mjs）を入れる。
// ノートブック・プロパティ・メモの項目は repository へ直に入れ、本文は開いたメモに Markdown を貼り付けて書式にする。

import { translate } from "../app-checks/appMessages.mjs";
import { exposeApp, navigate } from "../app-checks/visualConsistency/appInternals.mjs";
import { pasteMarkdown, placeCursorAtEnd } from "../app-checks/visualConsistency/appOperations.mjs";
import { NOTEBOOKS, NOTE_LINKS, NOTES, WORK_PROPERTIES, WORK_PROPERTY_VALUES } from "./docsSampleNotes.mjs";

// 貼り付けた本文が保存され、一覧の要約に出るまで待つ時間の目安。
const PASTE_SETTLE_MILLISECONDS = 600;

export async function createVault(page, { baseUrl, passphrase }) {
  await page.goto(baseUrl);
  await page.getByLabel(translate("setup.passphrase"), { exact: true }).fill(passphrase);
  await page.getByLabel(translate("setup.passphraseConfirm")).fill(passphrase);
  await page.getByRole("button", { name: translate("setup.submitNew") }).click();
  await page.locator(".workspace, .phone").first().waitFor();
}

export async function fillDocsSampleWorkspace(page) {
  await exposeApp(page);
  await page.evaluate(async ({ notebooks, properties }) => {
    const { repository } = window.__visualAudit;
    const idsByName = {};
    for (const notebook of notebooks) {
      const created = await repository.createNotebook(notebook.name, notebook.parent ? idsByName[notebook.parent] : null);
      idsByName[notebook.name] = created.id;
      if (notebook.colorName || notebook.iconName) {
        await repository.updateNotebook(created.id, { colorName: notebook.colorName, iconName: notebook.iconName });
      }
    }
    for (const property of properties) {
      await repository.saveNotebookProperty(idsByName["仕事"], { ...property, order: properties.indexOf(property) });
    }
    window.__docsNotebookIds = idsByName;
  }, { notebooks: NOTEBOOKS, properties: WORK_PROPERTIES });

  for (const note of NOTES) {
    await exposeApp(page);
    const noteId = await page.evaluate(async ({ title, notebook }) => {
      const created = await window.__visualAudit.repository.createNote({ title, notebookId: window.__docsNotebookIds[notebook] });
      return created.id;
    }, note);
    await navigate(page, "openNote", noteId);
    await page.locator(".ProseMirror").first().waitFor();
    await page.waitForFunction((title) => [...document.querySelectorAll("input, textarea")].some((field) => field.value === title), note.title);
    await page.locator(".ProseMirror").first().click();
    await pasteMarkdown(page, note.markdown);
    await page.waitForTimeout(PASTE_SETTLE_MILLISECONDS);
  }

  for (const link of NOTE_LINKS) {
    const targetId = await noteIdOf(page, link.to);
    await openSampleNote(page, link.from);
    await placeCursorAtEnd(page);
    await page.keyboard.press("Enter");
    await pasteMarkdown(page, `${link.text} [${link.to}](sedum-note://note/${targetId})`);
    await page.waitForTimeout(PASTE_SETTLE_MILLISECONDS);
  }

  await exposeApp(page);
  await page.evaluate(async (valuesByTitle) => {
    const { repository } = window.__visualAudit;
    const workNotebook = repository.notebooks().find((notebook) => notebook.content.name === "仕事");
    for (const [title, values] of Object.entries(valuesByTitle)) {
      const note = repository.notes().find((candidate) => candidate.content.title === title);
      for (const [propertyName, value] of Object.entries(values)) {
        const definition = workNotebook.content.properties.find((property) => property.name === propertyName);
        await repository.setNotePropertyValue(note.id, definition.id, value);
      }
    }
  }, WORK_PROPERTY_VALUES);
}

// タブの × を押してから、タブが画面から消えるまでの上限。ふつうは 1 回の描画で済む。
const TAB_CLOSE_TIMEOUT_MILLISECONDS = 5000;
const TAB_SELECTOR = ".tabs [role=tab]";

// PC の画面で、前に開いたタブを左から順に × で全部閉じる（画像に写すタブは、撮る側が選んで開く）。数は画面のタブで数える
// （exposeApp で取る navigation は、描き直しのあとも古い写しのままのことがあり、閉じたタブを一覧に残して返す）。
export async function closeAllTabs(page) {
  for (let remaining = await page.locator(TAB_SELECTOR).count(); remaining > 0; remaining -= 1) {
    await page.locator(TAB_SELECTOR).first().locator(".tab-close").evaluate((button) => button.click());
    await page.waitForFunction(({ selector, count }) => document.querySelectorAll(selector).length < count,
      { selector: TAB_SELECTOR, count: remaining }, { timeout: TAB_CLOSE_TIMEOUT_MILLISECONDS });
  }
}

async function noteIdOf(page, title) {
  await exposeApp(page);
  return page.evaluate((wanted) => window.__visualAudit.repository.notes().find((note) => note.content.title === wanted).id, title);
}

// 見本のメモを題で開き、本文が描かれるまで待つ。
export async function openSampleNote(page, title) {
  await navigate(page, "openNote", await noteIdOf(page, title));
  await page.waitForFunction((wanted) => [...document.querySelectorAll("input, textarea")].some((field) => field.value === wanted), title);
  await page.locator(".ProseMirror").first().waitFor();
}
