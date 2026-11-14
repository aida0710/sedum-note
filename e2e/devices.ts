// 画面の試験で使う「デバイス」（別々の保存を持つブラウザのページ）の用意。

import { type Browser, expect, type Page } from "@playwright/test";
import type { S3RemoteConfig } from "../src/core/remote/remoteConfig";

export const PASSPHRASE = "correct horse battery";
export const DESKTOP_VIEWPORT = { width: 1280, height: 820 };
export const PHONE_VIEWPORT = { width: 390, height: 844 };

// 同期なしの vault を作って、メモの画面まで進める。
export async function startLocalVault(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByLabel("パスフレーズ", { exact: true }).fill(PASSPHRASE);
  await page.getByLabel("パスフレーズ（確認）").fill(PASSPHRASE);
  await page.getByRole("button", { name: "作成" }).click();
}

// ロックの画面で、パスフレーズを入れて解除する。
export async function unlockApp(page: Page): Promise<void> {
  await page.getByLabel("パスフレーズ", { exact: true }).fill(PASSPHRASE);
  await page.getByRole("button", { name: "解除" }).click();
}

// 試験の同期先で使う、自分で決めた暗号化キー。
export const SYNC_KEY = "shared-key-for-e2e";

// 最初の画面で「ほかのデバイスと同期する」を選び、同期先を入れる。
export async function fillSyncTarget(page: Page, remoteConfig: S3RemoteConfig): Promise<void> {
  await page.getByLabel("ほかのデバイスと同期する").check();
  await fillRemoteConfigFields(page, remoteConfig);
}

// 同期先の入力欄（最初の画面と、設定の同期の欄で同じ）を埋める。
export async function fillRemoteConfigFields(page: Page, remoteConfig: S3RemoteConfig): Promise<void> {
  await page.getByLabel("エンドポイント").fill(remoteConfig.endpoint);
  await page.getByLabel("バケット").fill(remoteConfig.bucket);
  await page.getByLabel("リージョン").fill(remoteConfig.region);
  await page.getByLabel("フォルダ").fill(remoteConfig.prefix);
  await page.getByLabel("アクセスキーID").fill(remoteConfig.accessKeyId);
  await page.getByLabel("シークレットアクセスキー").fill(remoteConfig.secretAccessKey);
}

type SyncedVaultInput = {
  remoteConfig: S3RemoteConfig;
  // true なら、ほかのデバイスが作ったメモに参加する。
  join: boolean;
};

// 最初の画面から、同期するメモを始める。同期先を確かめ、空なら暗号化キーを決めて作り、既存のメモがあれば
// 暗号化キーを入れて参加する。パスフレーズはデバイスごとのものだが、試験では同じにしておく。
export async function startSyncedVault(page: Page, { remoteConfig, join }: SyncedVaultInput): Promise<void> {
  await page.goto("/");
  await page.getByLabel("パスフレーズ", { exact: true }).fill(PASSPHRASE);
  await page.getByLabel("パスフレーズ（確認）").fill(PASSPHRASE);
  await fillSyncTarget(page, remoteConfig);
  await page.getByRole("button", { name: "接続を確認" }).click();
  await expect(page.getByRole("status")).toContainText(join ? "既存のメモが見つかりました" : "空の同期先です");
  if (!join) {
    await page.getByRole("radio", { name: "自分で入力する" }).click();
  }
  await page.getByLabel("暗号化キー", { exact: true }).fill(SYNC_KEY);
  await page.getByRole("button", { name: join ? "参加" : "作成" }).click();
}

// hasTouch は、タッチの操作（引いて同期など）を送る端末で true にする。
type SyncedDeviceInput = SyncedVaultInput & { viewport?: { width: number; height: number }; hasTouch?: boolean };

export async function openSyncedDevice(browser: Browser, { remoteConfig, join, viewport = DESKTOP_VIEWPORT, hasTouch = false }: SyncedDeviceInput): Promise<Page> {
  const page = await (await browser.newContext({ viewport, hasTouch })).newPage();
  await startSyncedVault(page, { remoteConfig, join });
  return page;
}

// PC の画面で、左下の歯車から設定を開き、左のページの一覧からページを選ぶ（ページの名前は一覧の文言）。
export async function openSettingsPage(page: Page, pageName: string): Promise<void> {
  await page.getByRole("button", { name: "設定", exact: true }).click();
  await selectSettingsPage(page, pageName);
}

// 開いている設定で、左のページの一覧からページを選ぶ。
export async function selectSettingsPage(page: Page, pageName: string): Promise<void> {
  await page.getByRole("navigation", { name: "設定のページ" }).getByRole("button", { name: pageName, exact: true }).click();
}

// PC の画面で、設定の「今すぐ同期」を押して終わるのを待ち、元のメモのタブへ戻る。左下の同期の状態を押すと、同期のページが開く。
export async function syncNowOnDesktop(page: Page, noteTitle: string): Promise<void> {
  await page.locator(".sync-line").click();
  const syncNow = page.getByRole("button", { name: "今すぐ同期" });
  await syncNow.click();
  await syncNow.and(page.locator(":enabled")).waitFor();
  await page.getByRole("tab", { name: noteTitle }).click();
}

// PC の画面で新しいメモを作り、タイトルを入れて、本文にカーソルを移す。
export async function createNoteOnDesktop(page: Page, title: string): Promise<void> {
  // メモの画面が出てから数える（最初の画面の「始める」などの切り替えもタブなので）。
  const newNoteButton = page.getByRole("button", { name: "新しいメモ" });
  await newNoteButton.waitFor();
  const tabsBefore = await page.getByRole("tab").count();
  await newNoteButton.click();
  // 新しいメモのタブが開いてから打つ。早すぎると、前に開いていたメモのタイトル欄に入る。
  await expect(page.getByRole("tab")).toHaveCount(tabsBefore + 1);
  await page.getByPlaceholder("タイトル").fill(title);
  await page.getByPlaceholder("タイトル").press("Enter");
}

// PC の画面の左の列で、ノートブックを足す。
export async function addNotebookOnDesktop(page: Page, name: string): Promise<void> {
  await page.getByRole("button", { name: "ノートブックを追加" }).click();
  await page.getByPlaceholder("ノートブックの名前").fill(name);
  await page.getByPlaceholder("ノートブックの名前").press("Enter");
}

// 本文の末尾にカーソルを置く。クリックと Ctrl+End では、続けて送ったキーが、エディタが選択を読み直す前に届いて
// 前の位置に入ることがあるので、エディタの API で移す。
export async function placeCursorAtBodyEnd(page: Page): Promise<void> {
  await page.evaluate(() => {
    const body = document.querySelector(".ProseMirror") as HTMLElement & { editor: { commands: { focus: (position: "end") => boolean }; view: { focus: () => void } } };
    body.editor.commands.focus("end");
    // Tiptap の focus は、フォーカスを次の描画まで待つ。続けて打つ文字が本文に入るよう、その場でもフォーカスを移す。
    body.editor.view.focus();
  });
}

// 本文で「/」の候補から選んで入れる。PC の画面では、写真・表・コードなどの挿入は「/」から使う。
// query で候補を絞り、option の名前の候補を押す。
export async function insertFromSlashMenu(page: Page, query: string, option: string): Promise<void> {
  await page.keyboard.type(`/${query}`);
  await page.getByRole("listbox", { name: "ブロックの種類" }).getByRole("option", { name: option, exact: true }).click();
}

// 本文のカーソルの所に、HTML で書いた中身を入れる（長いメモや、キーで作りにくい並びを用意するとき）。カーソルは入れた中身の末尾に残る。
export async function insertBodyHtml(page: Page, html: string): Promise<void> {
  await page.evaluate((content) => {
    const body = document.querySelector(".ProseMirror") as HTMLElement & { editor: { commands: { insertContent: (content: string) => boolean } } };
    body.editor.commands.insertContent(content);
  }, html);
}

// 画面の座標での、要素の上下の端。
type VerticalEdges = { top: number; bottom: number };

// 本文のカーソル（選択の先頭）と、本文を縦に送る枠の、画面の座標での上下の端。
export async function caretAndBodyFrame(page: Page): Promise<{ caret: VerticalEdges; frame: VerticalEdges }> {
  return page.evaluate(() => {
    const body = document.querySelector(".ProseMirror") as HTMLElement & { editor: { state: { selection: { head: number } }; view: { coordsAtPos: (position: number) => { top: number; bottom: number } } } };
    const caret = body.editor.view.coordsAtPos(body.editor.state.selection.head);
    const frame = document.querySelector(".document-scroll")!.getBoundingClientRect();
    return { caret: { top: caret.top, bottom: caret.bottom }, frame: { top: frame.top, bottom: frame.bottom } };
  });
}

// text で始まる文字のブロック（段落・見出し・コード）の先頭か末尾に、カーソルを置く。クリックや Home・End のキーでは、
// 続けて送ったキーが、エディタが選択を読み直す前に届くことがあるので、エディタの API で移す。
export async function placeCursorInBlock(page: Page, text: string, edge: "start" | "end"): Promise<void> {
  await page.evaluate(({ blockText, blockEdge }) => {
    type TextblockNode = { isTextblock: boolean; textContent: string; content: { size: number } };
    const body = document.querySelector(".ProseMirror") as HTMLElement & {
      editor: {
        state: { doc: { descendants: (visit: (node: TextblockNode, position: number) => boolean) => void } };
        commands: { setTextSelection: (position: number) => boolean };
        view: { focus: () => void };
      };
    };
    let cursor: number | null = null;
    body.editor.state.doc.descendants((node, position) => {
      if (cursor === null && node.isTextblock && node.textContent.startsWith(blockText)) {
        cursor = position + 1 + (blockEdge === "end" ? node.content.size : 0);
      }
      return cursor === null;
    });
    if (cursor === null) {
      throw new Error(`「${blockText}」で始まるブロックが本文に無い`);
    }
    body.editor.commands.setTextSelection(cursor);
    body.editor.view.focus();
  }, { blockText: text, blockEdge: edge });
}

// カーソルのある文字のブロックの中身。キーでカーソルを動かした直後は、エディタが選択を読み直すまで少し遅れるので、
// 動いた先を expect.poll で待つのに使う。
export async function textOfBlockAtCursor(page: Page): Promise<string> {
  return page.evaluate(() => {
    const body = document.querySelector(".ProseMirror") as HTMLElement & { editor: { state: { selection: { $from: { parent: { textContent: string } } } } } };
    return body.editor.state.selection.$from.parent.textContent;
  });
}
