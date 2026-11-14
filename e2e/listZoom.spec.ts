import { expect, type Page, test } from "@playwright/test";
import { createNoteOnDesktop, insertFromSlashMenu, PHONE_VIEWPORT, placeCursorAtBodyEnd, startLocalVault } from "./devices";

const SCREENSHOT_DIRECTORY = process.env.SCREENSHOT_DIRECTORY;
// ズームしている間に左上に出る、戻るボタン。名前は「「戻り先」に戻る」。
const zoomBackButton = (page: Page) => page.getByRole("button", { name: /^「.*」に戻る$/ });
// 画面に出ている本文の行。
const visibleLines = (page: Page) => page.locator(".ProseMirror p:visible");

// text だけの行を押して、カーソルを置く。押した直後は、エディタの中の選択が少し遅れて追いつくので、
// エディタの選択（Tiptap が本文の要素に付ける editor から読む）がその行に移ったのを確かめてから戻る。
async function placeCursorIn(page: Page, text: string): Promise<void> {
  await page.locator(".ProseMirror p", { hasText: new RegExp(`^${text}$`) }).click();
  await expect.poll(() => page.evaluate(() => {
    const body = document.querySelector(".ProseMirror") as (HTMLElement & { editor?: { state: { selection: { $from: { parent: { textContent: string } } } } } }) | null;
    return body?.editor?.state.selection.$from.parent.textContent ?? null;
  })).toBe(text);
}

async function zoomIntoItem(page: Page, text: string): Promise<void> {
  await placeCursorIn(page, text);
  await page.keyboard.press("Control+.");
  await expect(visibleLines(page).first()).toHaveText(text);
}

// 「旅行 > 宿 > 駅前のホテル」「旅行 > 持ち物」の箇条書きと、その前後の段落を書く。カーソルは「駅前のホテル」に置く。
async function writeNestedList(page: Page): Promise<void> {
  await startLocalVault(page);
  await createNoteOnDesktop(page, "計画");
  await page.keyboard.type("はじめに");
  await page.keyboard.press("Enter");
  await page.keyboard.type("- 旅行");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Tab");
  await page.keyboard.type("宿");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Tab");
  await page.keyboard.type("駅前のホテル");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.type("持ち物");
  await placeCursorIn(page, "駅前のホテル");
  await expect(page.locator(".ProseMirror p")).toHaveText(["はじめに", "旅行", "宿", "駅前のホテル", "持ち物", ""]);
}

test("箇条書きの項目にズームすると、窓いっぱいにその項目と子だけが出る。左上の戻るボタンで 1 つずつ上の階層へ戻り、最後に全体へ戻る", async ({ page }) => {
  await writeNestedList(page);
  // カーソルのある「駅前のホテル」から、キーで 1 つ上の「宿」へ戻る形で確かめる。
  await zoomIntoItem(page, "駅前のホテル");
  await expect(visibleLines(page)).toHaveText(["駅前のホテル"]);
  await expect(zoomBackButton(page)).toHaveAccessibleName("「宿」に戻る");
  // 題・ツールバーは出さず、メモの画面が窓いっぱいに広がって、左の列とタブを覆う。
  await expect(page.getByPlaceholder("タイトル")).toHaveCount(0);
  await expect(page.locator(".editor-bar")).toHaveCount(0);
  expect(await page.locator(".note-editor.zoomed-view").boundingBox()).toEqual({ x: 0, y: 0, ...page.viewportSize()! });
  const backBox = (await zoomBackButton(page).boundingBox())!;
  expect(backBox.x).toBeLessThan(40);
  expect(backBox.y).toBeLessThan(40);
  await page.keyboard.press("Control+Shift+.");
  await expect(visibleLines(page)).toHaveText(["宿", "駅前のホテル"]);
  await expect(zoomBackButton(page)).toHaveAccessibleName("「旅行」に戻る");
  if (SCREENSHOT_DIRECTORY) {
    await page.screenshot({ path: `${SCREENSHOT_DIRECTORY}/zoomed-item.png` });
  }

  // ズームしたまま書き足せる。本文は変わらず、隠れているだけ。
  await page.keyboard.press("Enter");
  await page.keyboard.type("朝食つき");
  await expect(visibleLines(page)).toHaveText(["宿", "駅前のホテル", "朝食つき"]);

  await zoomBackButton(page).click();
  await expect(visibleLines(page)).toHaveText(["旅行", "宿", "駅前のホテル", "朝食つき", "持ち物"]);
  // いちばん上の項目からは、メモの題を添えて、メモ全体へ戻る。
  await expect(zoomBackButton(page)).toHaveAccessibleName("「計画」に戻る");
  await zoomBackButton(page).click();
  await expect(zoomBackButton(page)).toHaveCount(0);
  await expect(page.locator(".note-editor.zoomed-view")).toHaveCount(0);
  await expect(page.getByPlaceholder("タイトル")).toHaveValue("計画");
  await expect(visibleLines(page)).toHaveText(["はじめに", "旅行", "宿", "駅前のホテル", "朝食つき", "持ち物", ""]);
});

test("メモのメニューからもズームできる。ズームしている間の全選択は、見えている項目の中だけに掛かる", async ({ page }) => {
  await writeNestedList(page);
  await page.getByRole("button", { name: "その他の操作" }).last().click();
  await page.getByRole("menuitem", { name: "この項目にズーム" }).click();
  await expect(visibleLines(page)).toHaveText(["駅前のホテル"]);

  // ズームしている間の全選択は、見えている項目の中だけを選ぶ。消しても、隠れている行は残る。
  await page.keyboard.press("Control+a");
  await page.keyboard.press("Delete");
  await page.keyboard.press("Control+Shift+.");
  await page.keyboard.press("Control+Shift+.");
  await page.keyboard.press("Control+Shift+.");
  await expect(visibleLines(page)).toHaveText(["はじめに", "旅行", "宿", "", "持ち物", ""]);

  // 箇条書きの外にカーソルがあるときは、メニューにズームを出さない。
  await placeCursorIn(page, "はじめに");
  await page.getByRole("button", { name: "その他の操作" }).last().click();
  await expect(page.getByRole("menuitem", { name: "ピン留め" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "この項目にズーム" })).toHaveCount(0);
});

test("ズームしている項目の題の行で Enter を押すと、カーソルから後ろが最初の子になり、元の子も見えたまま", async ({ page }) => {
  await writeNestedList(page);
  await zoomIntoItem(page, "宿");
  await expect(visibleLines(page)).toHaveText(["宿", "駅前のホテル"]);
  await page.keyboard.press("Enter");
  await page.keyboard.type("予約する");
  await expect(visibleLines(page)).toHaveText(["宿", "予約する", "駅前のホテル"]);
  await zoomBackButton(page).click();
  await zoomBackButton(page).click();
  await expect(visibleLines(page)).toHaveText(["はじめに", "旅行", "宿", "予約する", "駅前のホテル", "持ち物", ""]);
});

test("ズームしている間に、メモの中の検索でズームの外の言葉へ移ると、ズームをやめて行き先を見せる", async ({ page }) => {
  await startLocalVault(page);
  await createNoteOnDesktop(page, "計画");
  await page.keyboard.type("## 行程");
  await page.keyboard.press("Enter");
  await page.keyboard.type("- 宿");
  await page.keyboard.press("Control+.");
  await expect(visibleLines(page)).toHaveText(["宿"]);
  await page.keyboard.press("Control+f");
  await page.getByPlaceholder("このメモの中を検索").fill("行程");
  await page.getByPlaceholder("このメモの中を検索").press("Enter");
  await expect(zoomBackButton(page)).toHaveCount(0);
  await expect(page.locator(".ProseMirror h2")).toBeVisible();
});

test("箇条書きの行頭の印を押すと、その項目にズームする", async ({ page }) => {
  await writeNestedList(page);
  // 「宿」の項目の印（行の左の余白）を押す。
  const lodging = page.locator(".ProseMirror li", { has: page.locator("> p", { hasText: /^宿$/ }) });
  const firstLine = (await lodging.locator("> p").boundingBox())!;
  await page.mouse.click(firstLine.x - 10, firstLine.y + firstLine.height / 2);
  await expect(visibleLines(page)).toHaveText(["宿", "駅前のホテル"]);
  await expect(zoomBackButton(page)).toHaveAccessibleName("「旅行」に戻る");
});

test("見出しの左のボタンで、そのセクション（次の同じ段か上の段の見出しの前まで）にズームする。戻るボタンで上の段の見出しのセクションへ戻る", async ({ page }) => {
  await startLocalVault(page);
  await createNoteOnDesktop(page, "章立て");
  for (const line of ["# 第1章", "前置き", "## 1.1 節", "節の本文", "### 1.1.1 項", "項の本文", "## 1.2 節", "次の節の本文", "# 第2章", "次の章の本文"]) {
    await page.keyboard.type(line);
    await page.keyboard.press("Enter");
  }
  const section = page.locator(".ProseMirror h3", { hasText: "1.1.1 項" });
  const heading = page.locator(".ProseMirror h2", { hasText: "1.1 節" });
  await heading.hover();
  // ボタンは見出しの文字の左（本文の左の余白）に出る。
  const zoomButton = heading.getByRole("button", { name: "このセクションにズーム" });
  expect((await zoomButton.boundingBox())!.x + (await zoomButton.boundingBox())!.width).toBeLessThanOrEqual((await heading.boundingBox())!.x);
  await zoomButton.click();
  await expect(page.locator(".ProseMirror > :visible")).toHaveText(["1.1 節", "節の本文", "1.1.1 項", "項の本文"]);
  await expect(section).toBeVisible();
  await expect(zoomBackButton(page)).toHaveAccessibleName("「第1章」に戻る");

  // 戻るボタンで、上の段の見出し「第1章」のセクションへ出る。
  await zoomBackButton(page).click();
  await expect(page.locator(".ProseMirror > :visible")).toHaveText(["第1章", "前置き", "1.1 節", "節の本文", "1.1.1 項", "項の本文", "1.2 節", "次の節の本文"]);

  // カーソルのある見出しには、メモの「…」からもズームできる。
  await zoomBackButton(page).click();
  await page.locator(".ProseMirror h1", { hasText: "第2章" }).click();
  await page.locator(".editor-bar").getByRole("button", { name: "その他の操作" }).click();
  await page.getByRole("menuitem", { name: "このセクションにズーム" }).click();
  await expect(page.locator(".ProseMirror > :visible").first()).toHaveText("第2章");
  await expect(page.locator(".ProseMirror p", { hasText: "次の章の本文" })).toBeVisible();
  await expect(page.locator(".ProseMirror p", { hasText: "前置き" })).toBeHidden();
});

test("スマホでは、ズームしている間は上の「戻る」が 1 つ上の階層へ戻るボタンになり、全体に戻ってからの「戻る」で一覧へ戻る", async ({ browser }) => {
  const page = await (await browser.newContext({ viewport: PHONE_VIEWPORT })).newPage();
  await startLocalVault(page);
  await page.getByRole("button", { name: "新しいメモ" }).click();
  await page.getByPlaceholder("タイトル").fill("計画");
  await page.getByPlaceholder("タイトル").press("Enter");
  await page.keyboard.type("- 旅行");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Tab");
  await page.keyboard.type("宿");
  await placeCursorIn(page, "宿");
  await page.getByRole("button", { name: "その他の操作" }).click();
  await page.getByRole("menuitem", { name: "この項目にズーム" }).click();

  await expect(visibleLines(page)).toHaveText(["宿"]);
  await expect(page.getByPlaceholder("タイトル")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "その他の操作" })).toHaveCount(0);
  await zoomBackButton(page).click();
  await expect(visibleLines(page)).toHaveText(["旅行", "宿"]);
  await expect(zoomBackButton(page)).toHaveAccessibleName("「計画」に戻る");
  await zoomBackButton(page).click();
  await expect(page.getByPlaceholder("タイトル")).toHaveValue("計画");
  await page.getByRole("button", { name: "戻る", exact: true }).click();
  await expect(page.getByPlaceholder("タイトル")).toHaveCount(0);
});

test("ズームしている間も、表の中では表のメニューが、録音している間は止めるボタンが、戻るボタンの右に出る", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "マイクの代わりの音は、Chromium の AudioContext で作る");
  // マイクの代わりに、作った音を返す。
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
  await createNoteOnDesktop(page, "表のメモ");
  await page.keyboard.type("## 在庫");
  await page.keyboard.press("Enter");
  await insertFromSlashMenu(page, "表", "表");
  const heading = page.locator(".ProseMirror h2", { hasText: "在庫" });
  await heading.hover();
  await heading.getByRole("button", { name: "このセクションにズーム" }).click();
  await expect(zoomBackButton(page)).toBeVisible();

  const zoomedTop = page.locator(".zoomed-view-top");
  await page.locator(".ProseMirror td").first().click();
  await zoomedTop.getByRole("button", { name: "表", exact: true }).click();
  await page.getByRole("menuitem", { name: "下に行を追加" }).click();
  await expect(page.locator(".ProseMirror tr")).toHaveCount(4);

  await placeCursorAtBodyEnd(page);
  await page.keyboard.press("Enter");
  await insertFromSlashMenu(page, "録音", "録音");
  const stopButton = zoomedTop.getByRole("button", { name: "録音を停止して添付" });
  await expect(stopButton).toBeVisible();
  await page.waitForTimeout(600);
  await stopButton.click();
  await expect(page.locator(".attachment-file")).toBeVisible();
  await expect(stopButton).toHaveCount(0);
});

test("見出しの左のズームのボタンは、本文の直下の見出しにだけ出る（段組みやコールアウトの中の見出しには出さない）", async ({ page }) => {
  await startLocalVault(page);
  await createNoteOnDesktop(page, "入れ子の見出し");
  await page.keyboard.type("## 外の見出し");
  await page.keyboard.press("Enter");
  await insertFromSlashMenu(page, "情報", "コールアウト: 情報");
  await page.keyboard.type("## 中の見出し");
  await expect(page.locator(".ProseMirror .callout h2")).toHaveText("中の見出し");
  await expect(page.locator(".ProseMirror > h2").getByRole("button", { name: "このセクションにズーム" })).toHaveCount(1);
  await expect(page.locator(".ProseMirror .callout h2").getByRole("button", { name: "このセクションにズーム" })).toHaveCount(0);
});

test("ズームしている間は、Esc でも 1 つ上の階層へ戻る。「/」の候補が開いているときの Esc は、候補を閉じるだけ", async ({ page }) => {
  await writeNestedList(page);
  await zoomIntoItem(page, "駅前のホテル");
  await page.keyboard.press("Escape");
  await expect(visibleLines(page)).toHaveText(["宿", "駅前のホテル"]);

  // 「/」の候補は、行頭か空白のあとで開く。
  await page.keyboard.press("Enter");
  await page.keyboard.type("/");
  const slashMenu = page.getByRole("listbox", { name: "ブロックの種類" });
  await expect(slashMenu).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(slashMenu).toHaveCount(0);
  await expect(zoomBackButton(page)).toHaveAccessibleName("「旅行」に戻る");

  // 本文の外（戻るボタン）にフォーカスがあっても戻る。
  await zoomBackButton(page).focus();
  await page.keyboard.press("Escape");
  await expect(zoomBackButton(page)).toHaveAccessibleName("「計画」に戻る");
  await page.keyboard.press("Escape");
  await expect(zoomBackButton(page)).toHaveCount(0);
  await expect(page.getByPlaceholder("タイトル")).toHaveValue("計画");
});

test("ズームに入るとき・戻るときは、本文を短く動かして切り替わりを見せる。動きを減らす設定では動かさない", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await writeNestedList(page);
  // 本文の入れ物で、今動いているアニメーションの数。
  const runningAnimations = () => page.locator(".document-scroll").evaluate((element) => element.getAnimations().length);
  await zoomIntoItem(page, "宿");
  expect(await runningAnimations()).toBeGreaterThan(0);
  await expect.poll(runningAnimations).toBe(0);
  // 戻るボタンで、1 つ上の「旅行」へ戻る。
  await zoomBackButton(page).click();
  expect(await runningAnimations()).toBeGreaterThan(0);
  await expect(zoomBackButton(page)).toHaveAccessibleName("「計画」に戻る");
  // 本文を書くだけでは動かさない。
  await expect.poll(runningAnimations).toBe(0);
  await placeCursorIn(page, "持ち物");
  await page.keyboard.type("リスト");
  expect(await runningAnimations()).toBe(0);

  await page.emulateMedia({ reducedMotion: "reduce" });
  await zoomIntoItem(page, "宿");
  expect(await runningAnimations()).toBe(0);
});

test.describe("動きを減らさない設定", () => {
  test.use({ contextOptions: { reducedMotion: "no-preference" } });

  test("ズームに入るときと戻るときに、本文の要素は作り直されず、高さが 0 になる瞬間も無い", async ({ page }) => {
    await writeNestedList(page);
    // 描画のたびに、本文の要素が同じものか、高さが残っているかを記録する（ズームの切り替えの動きの間も含む）。
    await page.evaluate(() => {
      const body = document.querySelector(".ProseMirror");
      const frames: Array<{ sameBody: boolean; height: number }> = [];
      (window as unknown as { zoomFrames: typeof frames }).zoomFrames = frames;
      const record = () => {
        const current = document.querySelector(".ProseMirror");
        frames.push({ sameBody: current === body, height: current?.getBoundingClientRect().height ?? 0 });
        requestAnimationFrame(record);
      };
      requestAnimationFrame(record);
    });
    await zoomIntoItem(page, "旅行");
    await page.keyboard.press("Escape");
    await expect(visibleLines(page).first()).toHaveText("はじめに");
    const frames = await page.evaluate(() => (window as unknown as { zoomFrames: Array<{ sameBody: boolean; height: number }> }).zoomFrames);
    expect(frames.length).toBeGreaterThan(0);
    expect(frames.every((frame) => frame.sameBody)).toBe(true);
    expect(Math.min(...frames.map((frame) => frame.height))).toBeGreaterThan(0);
  });
});
