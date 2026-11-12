import { expect, type Page, test } from "@playwright/test";
import { createNoteOnDesktop, openSettingsPage, startLocalVault } from "./devices";

// 試験では AI の提供元へつながない。届いた要求を覚えて、ストリーミングの形の決まった答えを返す。

type ChatRequestBody = { model: string; stream: boolean; fallbacks?: unknown; messages: Array<{ role: string; content: string }> };

async function enableAi(page: Page): Promise<void> {
  await openSettingsPage(page, "AI");
  await page.getByRole("checkbox", { name: "アプリ内の AI を使う" }).check();
}

async function saveAiSettingsAndOpenChat(page: Page, noteTitle: string): Promise<void> {
  await page.getByRole("button", { name: "AI の設定を保存" }).click();
  await page.getByRole("tab", { name: noteTitle }).click();
  await page.keyboard.press("Control+Alt+a");
}

const chat = (page: Page) => page.getByRole("region", { name: "AI チャット" });

// Claude の API のストリーミングの形（Server-Sent Events）で、answer を 2 つに分けて返す。
function claudeStreamBody(answer: string): string {
  const half = Math.ceil(answer.length / 2);
  const events: Array<[string, object]> = [
    ["message_start", { type: "message_start", message: { id: "msg_test", type: "message", role: "assistant", model: "claude-opus-5-5", content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 1 } } }],
    ["content_block_start", { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }],
    ["content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: answer.slice(0, half) } }],
    ["content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: answer.slice(half) } }],
    ["content_block_stop", { type: "content_block_stop", index: 0 }],
    ["message_delta", { type: "message_delta", delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 12 } }],
    ["message_stop", { type: "message_stop" }],
  ];
  return events.map(([name, data]) => `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`).join("");
}

// Claude の API の代わり。届いた要求を覚え、answers を順に返す。
async function mockClaudeApi(page: Page, answers: string[]): Promise<Array<{ headers: Record<string, string>; body: ChatRequestBody }>> {
  const requests: Array<{ headers: Record<string, string>; body: ChatRequestBody }> = [];
  await page.route("https://api.anthropic.com/v1/messages**", async (route) => {
    // ブラウザが先に送る、接続の許可の確認（OPTIONS）には、許可だけを返す。
    if (route.request().method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "POST" } });
      return;
    }
    requests.push({ headers: route.request().headers(), body: route.request().postDataJSON() });
    await route.fulfill({ contentType: "text/event-stream", headers: { "access-control-allow-origin": "*" }, body: claudeStreamBody(answers[requests.length - 1] ?? "") });
  });
  return requests;
}

test("AI チャットは、設定で有効にするまで使えない", async ({ page }) => {
  await startLocalVault(page);
  await createNoteOnDesktop(page, "買い物");
  await page.getByRole("button", { name: "その他の操作" }).last().click();
  await page.getByRole("menuitem", { name: "AI チャット" }).click();
  await expect(chat(page)).toContainText("アプリ内の AI は、まだ有効になっていません");
  await expect(chat(page).getByRole("textbox")).toHaveCount(0);
});

test("Claude の API をつなぎ先にして会話を続けられ、答えをメモのカーソルの位置に入れられる", async ({ page }) => {
  const requests = await mockClaudeApi(page, ["- 牛乳を買う\n- 卵を買う", "卵は 6 個入りです。"]);
  await startLocalVault(page);
  await createNoteOnDesktop(page, "買い物");
  await page.keyboard.type("牛乳と卵を買って帰る。");
  await enableAi(page);
  await page.getByLabel("API キー").fill("test-key");
  await saveAiSettingsAndOpenChat(page, "買い物");

  await chat(page).getByRole("button", { name: "要約する" }).click();
  const answers = chat(page).locator(".ai-message.assistant .ai-message-text");
  await expect(answers).toHaveText(["- 牛乳を買う\n- 卵を買う"]);
  // API キーをどのヘッダーに入れるかは SDK が決める。入れたキーが送られていることだけを確かめる。
  expect(Object.values(requests[0]!.headers).some((value) => value.includes("test-key"))).toBe(true);
  expect(requests[0]!.body).toMatchObject({ model: "claude-opus-5-5", stream: true, fallbacks: "default" });
  expect(requests[0]!.body.messages[0]!.content).toContain('<note title="買い物">');
  expect(requests[0]!.body.messages[0]!.content).toContain("牛乳と卵を買って帰る。");

  // 続けて聞くと、前のやり取りも一緒に送る。
  await chat(page).getByRole("textbox", { name: "AI への発言" }).fill("卵は何個？");
  await page.keyboard.press("Enter");
  await expect(answers).toHaveText(["- 牛乳を買う\n- 卵を買う", "卵は 6 個入りです。"]);
  expect(requests[1]!.body.messages.map((message) => message.role)).toEqual(["user", "assistant", "user"]);
  expect(requests[1]!.body.messages[1]!.content).toBe("- 牛乳を買う\n- 卵を買う");
  expect(requests[1]!.body.messages[2]!.content).toContain("卵は何個？");

  await page.locator(".ProseMirror").click();
  await page.keyboard.press("Control+End");
  await page.keyboard.press("Enter");
  await chat(page).locator(".ai-message.assistant").first().getByRole("button", { name: "カーソルの位置に挿入" }).click();
  await expect(page.locator(".ProseMirror li")).toHaveText(["牛乳を買う", "卵を買う"]);
  await expect(page.locator(".ProseMirror")).toContainText("牛乳と卵を買って帰る。");
});

test("選択した文字と、「@」で指定したメモを、文脈として渡せる。開いているメモは外せる", async ({ page }) => {
  const requests = await mockClaudeApi(page, ["はい。"]);
  await startLocalVault(page);
  await createNoteOnDesktop(page, "旅行の計画");
  await page.keyboard.type("出発は 8 月 3 日。");
  await createNoteOnDesktop(page, "持ち物");
  await page.keyboard.type("パスポートと充電器");
  await enableAi(page);
  await page.getByLabel("API キー").fill("test-key");
  await saveAiSettingsAndOpenChat(page, "持ち物");

  // 開いているメモ（持ち物）の「充電器」を選択する。
  await page.locator(".ProseMirror").click();
  await page.keyboard.press("Control+End");
  for (let character = 0; character < 3; character += 1) {
    await page.keyboard.press("Shift+ArrowLeft");
  }
  const context = chat(page).getByLabel("AI に渡す文脈");
  await expect(context.getByText("選択範囲（3 文字）")).toBeVisible();
  await context.getByLabel(/開いているメモ: 持ち物/).uncheck();

  const input = chat(page).getByRole("textbox", { name: "AI への発言" });
  await input.fill("@旅行");
  await expect(chat(page).getByRole("option")).toHaveText(["旅行の計画"]);
  await page.keyboard.press("Enter");
  await expect(input).toHaveValue("");
  await expect(context.getByText("旅行の計画", { exact: true })).toBeVisible();
  await input.fill("これは要る？");
  await page.keyboard.press("Enter");
  await expect(chat(page).locator(".ai-message.assistant .ai-message-text")).toHaveText(["はい。"]);

  const sent = requests[0]!.body.messages[0]!.content;
  expect(sent).toContain('<note title="旅行の計画">\n出発は 8 月 3 日。\n</note>');
  expect(sent).toContain('<selection note="持ち物">\n充電器\n</selection>');
  expect(sent).not.toContain("パスポート");
  expect(sent.endsWith("これは要る？")).toBe(true);
  // 送った発言には、何を渡したかが残る。
  await expect(chat(page).locator(".ai-message.user .chip")).toHaveText(["旅行の計画", "選択範囲（3 文字）"]);
});

test("OpenAI 互換のエンドポイントをつなぎ先にして答えてもらえる。キーが断られたら、その旨を出す", async ({ page }) => {
  let authorized = true;
  const requests: Array<{ authorization: string | undefined; body: ChatRequestBody }> = [];
  await page.route("http://127.0.0.1:11434/v1/chat/completions", async (route) => {
    requests.push({ authorization: route.request().headers().authorization, body: route.request().postDataJSON() });
    if (!authorized) {
      await route.fulfill({ status: 401, contentType: "application/json", body: "{}" });
      return;
    }
    const chunks = ["8 月 3 日", "です。"].map((content) => `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`);
    await route.fulfill({ contentType: "text/event-stream", body: `${chunks.join("")}data: [DONE]\n\n` });
  });
  await startLocalVault(page);
  await createNoteOnDesktop(page, "旅行の計画");
  await page.keyboard.type("出発は 8 月 3 日。");
  await enableAi(page);
  await page.getByLabel("つなぎ先").selectOption("openAiCompatible");
  await page.getByLabel("モデル").fill("local-model");
  await saveAiSettingsAndOpenChat(page, "旅行の計画");

  const input = chat(page).getByRole("textbox", { name: "AI への発言" });
  await input.fill("出発はいつ？");
  await page.keyboard.press("Enter");
  await expect(chat(page).locator(".ai-message.assistant .ai-message-text")).toHaveText(["8 月 3 日です。"]);
  expect(requests[0]!.authorization).toBeUndefined();
  expect(requests[0]!.body.model).toBe("local-model");
  expect(requests[0]!.body.messages.map((message) => message.role)).toEqual(["system", "user"]);
  expect(requests[0]!.body.messages[1]!.content).toContain("出発はいつ？");

  authorized = false;
  await input.fill("もう一度");
  await page.keyboard.press("Enter");
  await expect(chat(page).getByRole("alert")).toHaveText("API キーが受け付けられませんでした。「設定」の API キーを確かめてください。");
  // 失敗した回の、空の答えは会話に残さない。
  await expect(chat(page).locator(".ai-message.assistant")).toHaveCount(1);
});
