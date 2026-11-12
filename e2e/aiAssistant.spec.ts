import { expect, type Page, test } from "@playwright/test";
import { createNoteOnDesktop, startLocalVault } from "./devices";

// 試験では AI の提供元へつながない。届いた要求を覚えて、ストリーミングの形の決まった答えを返す。

async function openAiSettings(page: Page): Promise<void> {
  await page.getByRole("button", { name: /同期は未設定/ }).click();
  await page.getByRole("checkbox", { name: "アプリ内の AI を使う" }).check();
}

async function openAssistant(page: Page, noteTitle: string): Promise<void> {
  await page.getByRole("tab", { name: noteTitle }).click();
  await page.getByRole("button", { name: "その他の操作" }).last().click();
  await page.getByRole("menuitem", { name: "AI アシスタント" }).click();
}

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

test("アプリ内の AI は、設定で有効にするまで使えない", async ({ page }) => {
  await startLocalVault(page);
  await createNoteOnDesktop(page, "買い物");
  await openAssistant(page, "買い物");
  const assistant = page.getByRole("dialog", { name: "AI アシスタント" });
  await expect(assistant).toContainText("アプリ内の AI は、まだ有効になっていません");
  await expect(assistant.getByRole("button", { name: "要約する" })).toHaveCount(0);
});

test("Claude の API をつなぎ先にして、メモの要約を頼み、答えをメモの末尾に足せる", async ({ page }) => {
  const requests: Array<{ headers: Record<string, string>; body: { model: string; stream: boolean; fallbacks?: unknown; messages: Array<{ content: string }> } }> = [];
  await page.route("https://api.anthropic.com/v1/messages**", async (route) => {
    // ブラウザが先に送る、接続の許可の確認（OPTIONS）には、許可だけを返す。
    if (route.request().method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "POST" } });
      return;
    }
    requests.push({ headers: route.request().headers(), body: route.request().postDataJSON() });
    await route.fulfill({ contentType: "text/event-stream", headers: { "access-control-allow-origin": "*" }, body: claudeStreamBody("- 牛乳を買う\n- 卵を買う") });
  });
  await startLocalVault(page);
  await createNoteOnDesktop(page, "買い物");
  await page.keyboard.type("牛乳と卵を買って帰る。");
  await openAiSettings(page);
  await page.getByLabel("API キー").fill("test-key");
  await page.getByRole("button", { name: "AI の設定を保存" }).click();

  await openAssistant(page, "買い物");
  const assistant = page.getByRole("dialog", { name: "AI アシスタント" });
  await assistant.getByRole("button", { name: "要約する" }).click();
  await expect(assistant.getByLabel("AI の答え")).toHaveText("- 牛乳を買う\n- 卵を買う");

  expect(requests).toHaveLength(1);
  // API キーをどのヘッダーに入れるかは SDK が決める（今の版は Authorization）。入れたキーが送られていることだけを確かめる。
  expect(Object.values(requests[0]!.headers).some((value) => value.includes("test-key"))).toBe(true);
  expect(requests[0]!.body).toMatchObject({ model: "claude-opus-5-5", stream: true, fallbacks: "default" });
  expect(requests[0]!.body.messages[0]!.content).toContain("牛乳と卵を買って帰る。");

  await assistant.getByRole("button", { name: "メモの末尾に追加" }).click();
  await expect(assistant).toHaveCount(0);
  await expect(page.locator(".ProseMirror li")).toHaveText(["牛乳を買う", "卵を買う"]);
  await expect(page.locator(".ProseMirror")).toContainText("牛乳と卵を買って帰る。");
});

test("OpenAI 互換のエンドポイントをつなぎ先にして、メモへの質問に答えてもらえる。キーが断られたら、その旨を出す", async ({ page }) => {
  let authorized = true;
  const requests: Array<{ authorization: string | undefined; body: { model: string; messages: Array<{ role: string; content: string }> } }> = [];
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
  await openAiSettings(page);
  await page.getByLabel("つなぎ先").selectOption("openAiCompatible");
  await page.getByLabel("モデル").fill("local-model");
  await page.getByRole("button", { name: "AI の設定を保存" }).click();

  await openAssistant(page, "旅行の計画");
  const assistant = page.getByRole("dialog", { name: "AI アシスタント" });
  await assistant.getByRole("textbox", { name: "メモへの質問" }).fill("出発はいつ？");
  await page.keyboard.press("Enter");
  await expect(assistant.getByLabel("AI の答え")).toHaveText("8 月 3 日です。");
  expect(requests[0]!.authorization).toBeUndefined();
  expect(requests[0]!.body.model).toBe("local-model");
  expect(requests[0]!.body.messages.map((message) => message.role)).toEqual(["system", "user"]);
  expect(requests[0]!.body.messages[1]!.content).toContain("Question: 出発はいつ？");

  authorized = false;
  await assistant.getByRole("button", { name: "要約する" }).click();
  await expect(assistant.getByRole("alert")).toHaveText("API キーが受け付けられませんでした。「設定」の API キーを確かめてください。");
});
