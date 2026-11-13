import { expect, type Page, type Route, test } from "@playwright/test";
import { createNoteOnDesktop, openSettingsPage, PASSPHRASE, PHONE_VIEWPORT, startLocalVault } from "./devices";

// 試験では AI の提供元へつながない。届いた要求を覚えて、ストリーミングの形の決まった答えを返す。

type SentContent = string | Array<Record<string, unknown>>;
type ChatRequestBody = { model: string; max_tokens?: number; stream: boolean; fallbacks?: unknown; tools?: Array<{ name: string }>; messages: Array<{ role: string; content: SentContent }> };

// 送った発言の文（Claude の発言は、ブロックの並びで送る。文のブロックをつなぐ）。
function sentText(content: SentContent): string {
  return typeof content === "string" ? content : content.flatMap((block) => (block.type === "text" ? [String(block.text)] : [])).join("\n\n");
}

// 送った発言の中の、添えたメモの ID（<note id="…">）。
function attachedNoteId(body: ChatRequestBody): string {
  return /<note id=\\?"([0-9a-f]{32})/.exec(JSON.stringify(body.messages))![1]!;
}

// 送った会話の中の、最後のツールの結果。
function lastToolResults(body: ChatRequestBody): Array<Record<string, unknown>> {
  const last = body.messages[body.messages.length - 1]!.content;
  return typeof last === "string" ? [] : last.filter((block) => block.type === "tool_result");
}

async function enableAi(page: Page): Promise<void> {
  await openSettingsPage(page, "AI");
  await page.getByRole("checkbox", { name: "アプリ内の AI を使う" }).check();
}

// 「保存して確かめる」でモデルの一覧を取ってきてから、メモに戻ってチャットを開く。
async function saveAiSettingsAndOpenChat(page: Page, noteTitle: string): Promise<void> {
  await page.getByRole("button", { name: "保存して確かめる" }).click();
  await expect(page.getByRole("status").filter({ hasText: "つなぎ先につながりました" })).toBeVisible();
  await page.getByRole("tab", { name: noteTitle }).click();
  await page.keyboard.press("Control+Alt+a");
}

// ブラウザが先に送る、接続の許可の確認（OPTIONS）には、許可だけを返す。
async function allowPreflight(route: Route): Promise<boolean> {
  if (route.request().method() !== "OPTIONS") {
    return false;
  }
  await route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET, POST" } });
  return true;
}

type ClaudeModel = { id: string; name: string; maxTokens: number };
const CLAUDE_MODELS: ClaudeModel[] = [
  { id: "claude-sonnet-5-5", name: "Claude Sonnet 5.5", maxTokens: 32000 },
  { id: "claude-opus-5-5", name: "Claude Opus 5.5", maxTokens: 128000 },
];

// Claude の API のモデルの一覧の代わり。authorizedKey 以外のキーには 401 を返す。
async function mockClaudeModels(page: Page, authorizedKey = "test-key"): Promise<void> {
  await page.route("https://api.anthropic.com/v1/models**", async (route) => {
    if (await allowPreflight(route)) {
      return;
    }
    const headers = route.request().headers();
    if (!Object.values(headers).some((value) => value.includes(authorizedKey))) {
      await route.fulfill({ status: 401, contentType: "application/json", headers: { "access-control-allow-origin": "*" },
        body: JSON.stringify({ type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } }) });
      return;
    }
    const data = CLAUDE_MODELS.map((model) => ({ type: "model", id: model.id, display_name: model.name, created_at: "2026-11-01T00:00:00Z", max_input_tokens: 1000000, max_tokens: model.maxTokens }));
    await route.fulfill({ contentType: "application/json", headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify({ data, has_more: false, first_id: data[0]!.id, last_id: data[data.length - 1]!.id }) });
  });
}

const chat = (page: Page) => page.getByRole("region", { name: "AI チャット" });

// ツールの呼び出しを含む答え。thinking なら、先に thinking ブロック（中身は空で、署名だけがある）を返す。
type ToolAnswer = { text: string; toolCalls: Array<{ id: string; name: string; input: object }>; thinking?: boolean };
// 届いた要求から答えを決めるもの（メモの ID など、試験を書くときに分からない値を使う）。
type ClaudeAnswer = string | ToolAnswer | ((body: ChatRequestBody) => string | ToolAnswer);

// Claude の API のストリーミングの形（Server-Sent Events）で、答えの文を 2 つに分けて返す。
// ツールの呼び出しがあれば、そのあとに呼び出しごとの入力を 2 つに分けて返す。
function claudeStreamBody(answer: string | ToolAnswer): string {
  const text = typeof answer === "string" ? answer : answer.text;
  const half = Math.ceil(text.length / 2);
  const events: Array<[string, object]> = [
    ["message_start", { type: "message_start", message: { id: "msg_test", type: "message", role: "assistant", model: "claude-opus-5-5", content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 1 } } }],
  ];
  let index = 0;
  if (typeof answer !== "string" && answer.thinking) {
    events.push(
      ["content_block_start", { type: "content_block_start", index, content_block: { type: "thinking", thinking: "", signature: "" } }],
      ["content_block_delta", { type: "content_block_delta", index, delta: { type: "signature_delta", signature: "sig-test" } }],
      ["content_block_stop", { type: "content_block_stop", index }],
    );
    index += 1;
  }
  events.push(
    ["content_block_start", { type: "content_block_start", index, content_block: { type: "text", text: "" } }],
    ["content_block_delta", { type: "content_block_delta", index, delta: { type: "text_delta", text: text.slice(0, half) } }],
    ["content_block_delta", { type: "content_block_delta", index, delta: { type: "text_delta", text: text.slice(half) } }],
    ["content_block_stop", { type: "content_block_stop", index }],
  );
  const toolCalls = typeof answer === "string" ? [] : answer.toolCalls;
  for (const call of toolCalls) {
    index += 1;
    const input = JSON.stringify(call.input);
    const inputHalf = Math.ceil(input.length / 2);
    events.push(
      ["content_block_start", { type: "content_block_start", index, content_block: { type: "tool_use", id: call.id, name: call.name, input: {} } }],
      ["content_block_delta", { type: "content_block_delta", index, delta: { type: "input_json_delta", partial_json: input.slice(0, inputHalf) } }],
      ["content_block_delta", { type: "content_block_delta", index, delta: { type: "input_json_delta", partial_json: input.slice(inputHalf) } }],
      ["content_block_stop", { type: "content_block_stop", index }],
    );
  }
  events.push(
    ["message_delta", { type: "message_delta", delta: { stop_reason: toolCalls.length === 0 ? "end_turn" : "tool_use", stop_sequence: null }, usage: { output_tokens: 12 } }],
    ["message_stop", { type: "message_stop" }],
  );
  return events.map(([name, data]) => `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`).join("");
}

// Claude の API の代わり。届いた要求を覚え、answers を順に返す。
async function mockClaudeApi(page: Page, answers: ClaudeAnswer[]): Promise<Array<{ headers: Record<string, string>; body: ChatRequestBody }>> {
  const requests: Array<{ headers: Record<string, string>; body: ChatRequestBody }> = [];
  await mockClaudeModels(page);
  await page.route("https://api.anthropic.com/v1/messages**", async (route) => {
    if (await allowPreflight(route)) {
      return;
    }
    const body = route.request().postDataJSON() as ChatRequestBody;
    requests.push({ headers: route.request().headers(), body });
    const answer = answers[requests.length - 1] ?? "";
    await route.fulfill({ contentType: "text/event-stream", headers: { "access-control-allow-origin": "*" }, body: claudeStreamBody(typeof answer === "function" ? answer(body) : answer) });
  });
  return requests;
}

test("AI チャットは、設定で有効にするまで使えない。案内のボタンから設定の「AI」のページを開ける", async ({ page }) => {
  await startLocalVault(page);
  await createNoteOnDesktop(page, "買い物");
  await page.getByRole("button", { name: "その他の操作" }).last().click();
  await page.getByRole("menuitem", { name: "AI チャット" }).click();
  await expect(chat(page)).toContainText("アプリ内の AI は、まだ有効になっていません");
  await expect(chat(page).getByRole("textbox")).toHaveCount(0);

  await chat(page).getByRole("button", { name: "AI の設定を開く" }).click();
  await page.getByRole("checkbox", { name: "アプリ内の AI を使う" }).check();
  await expect(chat(page).getByRole("textbox")).toBeVisible();
});

test("スマホでも、AI チャットの案内のボタンでメモを閉じて設定の「AI」のページへ移り、端末の「戻る」で設定のページの一覧へ戻る", async ({ browser }) => {
  const page = await (await browser.newContext({ viewport: PHONE_VIEWPORT })).newPage();
  await startLocalVault(page);
  await page.getByRole("button", { name: "新しいメモ" }).click();
  await page.getByPlaceholder("タイトル").fill("買い物");
  await page.getByRole("button", { name: "その他の操作" }).click();
  await page.getByRole("menuitem", { name: "AI チャット" }).click();
  await chat(page).getByRole("button", { name: "AI の設定を開く" }).click();

  await expect(page.getByRole("checkbox", { name: "アプリ内の AI を使う" })).toBeVisible();
  await expect(page.getByPlaceholder("タイトル")).toHaveCount(0);
  await page.goBack();
  await expect(page.getByRole("checkbox", { name: "アプリ内の AI を使う" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "AI", exact: true })).toBeVisible();
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
  expect(sentText(requests[0]!.body.messages[0]!.content)).toContain('title="買い物" open="true">');
  expect(sentText(requests[0]!.body.messages[0]!.content)).toContain("牛乳と卵を買って帰る。");

  // 続けて聞くと、前のやり取りも一緒に送る。
  await chat(page).getByRole("textbox", { name: "AI への発言" }).fill("卵は何個？");
  await page.keyboard.press("Enter");
  await expect(answers).toHaveText(["- 牛乳を買う\n- 卵を買う", "卵は 6 個入りです。"]);
  expect(requests[1]!.body.messages.map((message) => message.role)).toEqual(["user", "assistant", "user"]);
  expect(sentText(requests[1]!.body.messages[1]!.content)).toBe("- 牛乳を買う\n- 卵を買う");
  expect(sentText(requests[1]!.body.messages[2]!.content)).toContain("卵は何個？");
  // ツールの一覧は、会話の間変わらない（メモを添えたかどうかで出し入れしない）。
  expect(requests[1]!.body.tools).toEqual(requests[0]!.body.tools);
  expect(requests[0]!.body.tools?.map((tool) => tool.name)).toContain("search_notes");

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
  await expect(chat(page).getByRole("listbox", { name: "指定するメモ" }).getByRole("option")).toHaveText(["旅行の計画"]);
  await page.keyboard.press("Enter");
  await expect(input).toHaveValue("");
  await expect(context.getByText("旅行の計画", { exact: true })).toBeVisible();
  await input.fill("これは要る？");
  await page.keyboard.press("Enter");
  await expect(chat(page).locator(".ai-message.assistant .ai-message-text")).toHaveText(["はい。"]);

  const sent = sentText(requests[0]!.body.messages[0]!.content);
  expect(sent).toContain('title="旅行の計画">\n出発は 8 月 3 日。\n</note>');
  expect(sent).toContain('<selection note="持ち物">\n充電器\n</selection>');
  expect(sent).not.toContain("パスポート");
  expect(sent.endsWith("これは要る？")).toBe(true);
  // 送った発言には、何を渡したかが残る。
  await expect(chat(page).locator(".ai-message.user .chip")).toHaveText(["旅行の計画", "選択範囲（3 文字）"]);
});

test("OpenAI 互換のエンドポイントをつなぎ先にして答えてもらえる。キーが断られたら、その旨を出す", async ({ page }) => {
  let authorized = true;
  const requests: Array<{ authorization: string | undefined; body: ChatRequestBody }> = [];
  await page.route("http://127.0.0.1:11434/v1/models", async (route) => {
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ object: "list", data: [{ id: "other-model" }, { id: "local-model" }] }) });
  });
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
  await saveAiSettingsAndOpenChat(page, "旅行の計画");
  await expect(chat(page).getByRole("combobox", { name: "モデル" })).toHaveValue("local-model");

  const input = chat(page).getByRole("textbox", { name: "AI への発言" });
  await input.fill("出発はいつ？");
  await page.keyboard.press("Enter");
  await expect(chat(page).locator(".ai-message.assistant .ai-message-text")).toHaveText(["8 月 3 日です。"]);
  expect(requests[0]!.authorization).toBeUndefined();
  expect(requests[0]!.body.model).toBe("local-model");
  expect(requests[0]!.body.messages.map((message) => message.role)).toEqual(["system", "user"]);
  expect(sentText(requests[0]!.body.messages[1]!.content)).toContain("出発はいつ？");

  authorized = false;
  await input.fill("もう一度");
  await page.keyboard.press("Enter");
  await expect(chat(page).getByRole("alert")).toHaveText("API キーが受け付けられませんでした。「設定」の「AI」のページの API キーを確かめてください。");
  // 失敗した回の、空の答えは会話に残さない。
  await expect(chat(page).locator(".ai-message.assistant")).toHaveCount(1);
});

test("API キーを保存すると、モデルの一覧を取ってきてキーを確かめる。断られたキーは保存せず、モデルは一覧から選ぶ", async ({ page }) => {
  await mockClaudeModels(page);
  await startLocalVault(page);
  await enableAi(page);
  await page.getByLabel("API キー").fill("wrong-key");
  await page.getByRole("button", { name: "保存して確かめる" }).click();
  await expect(page.getByRole("alert")).toHaveText("API キーが受け付けられませんでした。「設定」の「AI」のページの API キーを確かめてください。");
  await expect(page.getByRole("combobox", { name: "モデル" })).toHaveCount(0);

  await page.getByLabel("API キー").fill("test-key");
  await page.getByRole("button", { name: "保存して確かめる" }).click();
  await expect(page.getByRole("status").filter({ hasText: "つなぎ先につながりました" })).toHaveText("つなぎ先につながりました。モデルを 2 個取得しました。");
  const modelSelect = page.getByRole("combobox", { name: "モデル" });
  await expect(modelSelect).toHaveValue("claude-opus-5-5");
  await expect(modelSelect.getByRole("option")).toHaveText(["Claude Sonnet 5.5", "Claude Opus 5.5"]);
});

test("チャットの上でモデルを変えると、次の発言からそのモデルで頼み、答えの長さの上限もそのモデルに合わせる", async ({ page }) => {
  const requests = await mockClaudeApi(page, ["一つ目の答え", "二つ目の答え"]);
  await startLocalVault(page);
  await createNoteOnDesktop(page, "メモ");
  await enableAi(page);
  await page.getByLabel("API キー").fill("test-key");
  await saveAiSettingsAndOpenChat(page, "メモ");

  const input = chat(page).getByRole("textbox", { name: "AI への発言" });
  await input.fill("こんにちは");
  await page.keyboard.press("Enter");
  await expect(chat(page).locator(".ai-message.assistant .ai-message-text")).toHaveText(["一つ目の答え"]);
  expect(requests[0]!.body).toMatchObject({ model: "claude-opus-5-5", max_tokens: 64000 });

  await chat(page).getByRole("combobox", { name: "モデル" }).selectOption("claude-sonnet-5-5");
  await input.fill("続けて");
  await page.keyboard.press("Enter");
  await expect(chat(page).locator(".ai-message.assistant .ai-message-text")).toHaveText(["一つ目の答え", "二つ目の答え"]);
  expect(requests[1]!.body).toMatchObject({ model: "claude-sonnet-5-5", max_tokens: 32000 });
});

test("答えを受け取っている間は、送るボタンが止めるボタンに変わり、押すと止まる", async ({ page }) => {
  await mockClaudeModels(page);
  // 答えを返さずに待たせる。
  await page.route("https://api.anthropic.com/v1/messages**", async (route) => {
    if (await allowPreflight(route)) {
      return;
    }
  });
  await startLocalVault(page);
  await createNoteOnDesktop(page, "メモ");
  await enableAi(page);
  await page.getByLabel("API キー").fill("test-key");
  await saveAiSettingsAndOpenChat(page, "メモ");

  await chat(page).getByRole("textbox", { name: "AI への発言" }).fill("長い答えをください");
  await chat(page).getByRole("button", { name: "送る" }).click();
  const stop = chat(page).getByRole("button", { name: "止める" });
  await expect(stop).toBeVisible();
  await expect(chat(page).getByRole("button", { name: "送る" })).toHaveCount(0);
  await stop.click();
  await expect(chat(page).getByRole("button", { name: "送る" })).toBeVisible();
  await expect(chat(page).getByRole("button", { name: "止める" })).toHaveCount(0);
  // 1 文字も届かなかった答えは残さず、止めたことは失敗として出さない。
  await expect(chat(page).locator(".ai-message.assistant")).toHaveCount(0);
  await expect(chat(page).getByRole("alert")).toHaveCount(0);
});

test("会話は残り、ロックして開き直しても「残した会話」から開いて続きを話せる。消すこともできる", async ({ page }) => {
  const requests = await mockClaudeApi(page, ["8 月 3 日です。", "朝 9 時の便です。"]);
  await startLocalVault(page);
  await createNoteOnDesktop(page, "旅行の計画");
  await page.keyboard.type("出発は 8 月 3 日の朝 9 時。");
  await enableAi(page);
  await page.getByLabel("API キー").fill("test-key");
  await saveAiSettingsAndOpenChat(page, "旅行の計画");
  const input = chat(page).getByRole("textbox", { name: "AI への発言" });
  await input.fill("出発はいつ？");
  await page.keyboard.press("Enter");
  await expect(chat(page).locator(".ai-message.assistant .ai-message-text")).toHaveText(["8 月 3 日です。"]);
  await chat(page).getByRole("button", { name: "新しい会話" }).click();
  await expect(chat(page).locator(".ai-message")).toHaveCount(0);

  await page.keyboard.press("Control+l");
  await page.getByLabel("パスフレーズ", { exact: true }).fill(PASSPHRASE);
  await page.getByRole("button", { name: "解除" }).click();
  // ロックを解除すると、タブは開いていない。左の列からメモを開く。
  await page.locator(".tree-note", { hasText: "旅行の計画" }).click();
  await page.keyboard.press("Control+Alt+a");
  await chat(page).getByRole("button", { name: "残した会話" }).click();
  const savedChats = chat(page).getByRole("list", { name: "残した会話" }).getByRole("listitem");
  await expect(savedChats).toHaveCount(1);
  await savedChats.first().getByRole("button", { name: /^出発はいつ？/ }).click();
  await expect(chat(page).locator(".ai-message .ai-message-text")).toHaveText(["出発はいつ？", "8 月 3 日です。"]);

  // 開いた会話の続きを話すと、前のやり取りも送り、同じ会話として残す。
  await input.fill("何時？");
  await page.keyboard.press("Enter");
  await expect(chat(page).locator(".ai-message.assistant .ai-message-text")).toHaveText(["8 月 3 日です。", "朝 9 時の便です。"]);
  expect(requests[1]!.body.messages.map((message) => message.role)).toEqual(["user", "assistant", "user"]);
  // 添えたメモの本文は、残した会話には入れず、送るときに読む。
  expect(sentText(requests[1]!.body.messages[0]!.content)).toContain("出発は 8 月 3 日の朝 9 時。");
  await chat(page).getByRole("button", { name: "残した会話" }).click();
  await expect(savedChats).toHaveCount(1);
  await savedChats.first().getByRole("button", { name: "「出発はいつ？」を消す" }).click();
  await expect(savedChats).toHaveCount(0);
  await expect(chat(page).getByText("まだ残した会話がありません。")).toBeVisible();
});

// 果物のメモ（3 つの段落）を作り、最初の段落に文字色（Markdown に無い書式）を付けて、AI チャットを開く。
async function openChatOnFruitNote(page: Page): Promise<void> {
  await startLocalVault(page);
  await createNoteOnDesktop(page, "果物");
  await page.keyboard.type("りんご");
  await page.keyboard.press("Enter");
  await page.keyboard.type("ばなな");
  await page.keyboard.press("Enter");
  await page.keyboard.type("みかん");
  await page.locator(".ProseMirror p").first().click();
  await page.keyboard.press("Home");
  await page.keyboard.press("Shift+End");
  await page.getByRole("button", { name: "文字色" }).click();
  await page.getByRole("button", { name: "赤" }).click();
  await expect(page.locator('.ProseMirror [data-text-color="red"]')).toHaveText("りんご");
  await enableAi(page);
  await page.getByLabel("API キー").fill("test-key");
  await saveAiSettingsAndOpenChat(page, "果物");
}

// 果物のメモの本文の直し（replace_note_body）。添えたメモの ID を、届いた要求から読む。
const fruitEdit = (id: string) => (body: ChatRequestBody): ToolAnswer => ({
  text: "誤字を直します。",
  toolCalls: [{ id, name: "replace_note_body", input: { noteId: attachedNoteId(body), markdown: "りんご\n\nバナナ\n\nみかん\n\nぶどう" } }],
});
const approvalCard = (page: Page) => chat(page).getByRole("group", { name: "承認を待っている変更" });

test("開いているメモの直しを頼むと、差分を承認してから直したブロックだけが入れ替わる。文字色は残り、エディタの取り消しで戻せる", async ({ page }) => {
  const requests = await mockClaudeApi(page, [fruitEdit("toolu_fruit"), "直しました。"]);
  await openChatOnFruitNote(page);
  await chat(page).getByRole("textbox", { name: "AI への発言" }).fill("誤字を直して、ぶどうも足して");
  await page.keyboard.press("Enter");

  const card = approvalCard(page);
  await expect(card).toContainText("「果物」の本文を直す");
  await expect(card.getByLabel("消すブロック")).toHaveText(["ばなな"]);
  await expect(card.getByLabel("足すブロック")).toHaveText(["バナナ", "ぶどう"]);
  await expect(card.locator(".ai-edit-unchanged")).toHaveText(["変更のないブロック 1 個", "変更のないブロック 1 個"]);
  await expect(chat(page).locator(".ai-tool-activity")).toContainText("承認を待っています");
  // 承認するまでは、メモは変わらない。
  await expect(page.locator(".ProseMirror p")).toHaveText(["りんご", "ばなな", "みかん"]);

  await card.getByRole("button", { name: "行う", exact: true }).click();
  await expect(page.locator(".ProseMirror p")).toHaveText(["りんご", "バナナ", "みかん", "ぶどう"]);
  await expect(page.locator('.ProseMirror [data-text-color="red"]')).toHaveText("りんご");
  await expect(card).toHaveCount(0);
  // 結果を AI に返して、続きの答えを受け取る。
  await expect(chat(page).locator(".ai-message.assistant .ai-message-text")).toHaveText(["誤字を直します。", "直しました。"]);
  const followUp = requests[1]!.body.messages as Array<{ role: string; content: Array<Record<string, unknown>> }>;
  expect(followUp[1]!.content).toContainEqual(expect.objectContaining({ type: "tool_use", id: "toolu_fruit", name: "replace_note_body" }));
  expect(lastToolResults(requests[1]!.body)).toEqual([expect.objectContaining({ type: "tool_result", tool_use_id: "toolu_fruit", is_error: false })]);

  // 直す前の状態は、メモの履歴に残る。
  await page.getByRole("button", { name: "その他の操作" }).last().click();
  await page.getByRole("menuitem", { name: "履歴" }).click();
  await expect(page.getByRole("dialog", { name: "履歴" }).getByRole("option").first()).toContainText("本文の置き換えの前（AI・MCP・プラグイン）");
  await page.keyboard.press("Escape");

  // AI の直しは、エディタの取り消しで 1 回で戻せる。
  await page.locator(".ProseMirror p").first().click();
  await page.keyboard.press("ControlOrMeta+z");
  await expect(page.locator(".ProseMirror p")).toHaveText(["りんご", "ばなな", "みかん"]);
});

test("承認を待つ間にメモを書き換えると、その変更は行わない。作る・直すを聞かずに行う設定でも、ゴミ箱に入れるときは聞く", async ({ page }) => {
  await mockClaudeApi(page, [
    fruitEdit("toolu_first"),
    "書き換えられたので、直しませんでした。",
    fruitEdit("toolu_auto"),
    (body) => ({ text: "", toolCalls: [{ id: "toolu_trash", name: "move_note_to_trash", input: { noteId: attachedNoteId(body) } }] }),
    "やめておきます。",
  ]);
  await openChatOnFruitNote(page);
  const input = chat(page).getByRole("textbox", { name: "AI への発言" });
  await input.fill("直して");
  await page.keyboard.press("Enter");
  await expect(approvalCard(page)).toBeVisible();

  await page.locator(".ProseMirror p").last().click();
  await page.keyboard.press("End");
  await page.keyboard.type("とレモン");
  await approvalCard(page).getByRole("button", { name: "行う", exact: true }).click();
  await expect(chat(page).locator(".ai-tool-activity")).toContainText("承認を待つ間に対象が変わったため、行いませんでした");
  await expect(chat(page).locator(".ai-message.assistant .ai-message-text").last()).toHaveText("書き換えられたので、直しませんでした。");
  await expect(page.locator(".ProseMirror p")).toHaveText(["りんご", "ばなな", "みかんとレモン"]);

  await chat(page).getByRole("checkbox", { name: "メモを作る・直すときは、承認を待たずに行う" }).check();
  await input.fill("もう一度直して");
  await page.keyboard.press("Enter");
  await expect(page.locator(".ProseMirror p")).toHaveText(["りんご", "バナナ", "みかん", "ぶどう"]);

  // ゴミ箱に入れるのは、作る・直すとは別の許可（既定は毎回聞く）。
  await expect(approvalCard(page)).toContainText("「果物」をゴミ箱に入れる");
  await approvalCard(page).getByRole("button", { name: "行わない" }).click();
  await expect(chat(page).locator(".ai-tool-activity").last()).toContainText("承認しなかったため、行いませんでした");
  await expect(page.locator(".tree-note", { hasText: "果物" })).toBeVisible();
});

test("開いていないメモも、検索して読み、差分を承認して直せる。ツールの行を押すと、そのメモを開く", async ({ page }) => {
  let tripNoteId = "";
  const requests = await mockClaudeApi(page, [
    { text: "探します。", toolCalls: [{ id: "toolu_search", name: "search_notes", input: { query: "沖縄" } }] },
    (body) => {
      tripNoteId = (JSON.parse(String(lastToolResults(body)[0]!.content)) as { notes: Array<{ noteId: string }> }).notes[0]!.noteId;
      return { text: "", toolCalls: [{ id: "toolu_read", name: "get_note", input: { noteId: tripNoteId } }] };
    },
    () => ({ text: "", toolCalls: [{ id: "toolu_edit", name: "replace_note_body", input: { noteId: tripNoteId, markdown: "沖縄は 8 月 3 日に出発\n\n日焼け止めを持つ" } }] }),
    "直しました。",
  ]);
  await startLocalVault(page);
  await createNoteOnDesktop(page, "沖縄旅行");
  await page.keyboard.type("沖縄は 8 月 3 日に出発");
  await createNoteOnDesktop(page, "買い物");
  await enableAi(page);
  await page.getByLabel("API キー").fill("test-key");
  await saveAiSettingsAndOpenChat(page, "買い物");
  await chat(page).getByLabel(/開いているメモ: 買い物/).uncheck();
  await chat(page).getByRole("textbox", { name: "AI への発言" }).fill("沖縄のメモに、日焼け止めを持つと足して");
  await page.keyboard.press("Enter");

  await expect(approvalCard(page).getByLabel("足すブロック")).toHaveText(["日焼け止めを持つ"]);
  const activities = chat(page).locator(".ai-tool-activity");
  await expect(activities.nth(0)).toContainText("「沖縄」で検索");
  await expect(activities.nth(0)).toContainText("1 件");
  await expect(activities.nth(1)).toContainText("「沖縄旅行」を読む");
  await approvalCard(page).getByRole("button", { name: "行う", exact: true }).click();
  await expect(chat(page).locator(".ai-message.assistant .ai-message-text").last()).toHaveText("直しました。");
  expect(requests).toHaveLength(4);

  await activities.nth(2).click();
  await expect(page.getByPlaceholder("タイトル")).toHaveValue("沖縄旅行");
  await expect(page.locator(".ProseMirror p")).toHaveText(["沖縄は 8 月 3 日に出発", "日焼け止めを持つ"]);
});

test("承認を待っている間に止めると、何も変えずに止まり、次の発言では止めた呼び出しの結果を AI に返す。thinking ブロックは署名ごと送り返す", async ({ page }) => {
  const requests = await mockClaudeApi(page, [
    (body) => ({ text: "直します。", thinking: true, toolCalls: [{ id: "toolu_stopped", name: "replace_note_body", input: { noteId: attachedNoteId(body), markdown: "ちがう本文" } }] }),
    "わかりました。",
  ]);
  await openChatOnFruitNote(page);
  const input = chat(page).getByRole("textbox", { name: "AI への発言" });
  await input.fill("直して");
  await page.keyboard.press("Enter");
  await expect(approvalCard(page)).toBeVisible();
  await chat(page).getByRole("button", { name: "止める" }).click();
  await expect(approvalCard(page)).toHaveCount(0);
  await expect(chat(page).locator(".ai-tool-activity")).toContainText("止めたため、行いませんでした");
  await expect(page.locator(".ProseMirror p")).toHaveText(["りんご", "ばなな", "みかん"]);

  await input.fill("やっぱりいい");
  await page.keyboard.press("Enter");
  await expect(chat(page).locator(".ai-message.assistant .ai-message-text").last()).toHaveText("わかりました。");
  const sent = requests[1]!.body.messages as Array<{ role: string; content: Array<Record<string, unknown>> }>;
  expect(sent.map((message) => message.role)).toEqual(["user", "assistant", "user"]);
  expect(sent[1]!.content[0]).toMatchObject({ type: "thinking", signature: "sig-test" });
  // 止めた呼び出しの結果と、次の発言を、1 つの user の発言にまとめて送る。
  expect(sent[2]!.content[0]).toMatchObject({ type: "tool_result", tool_use_id: "toolu_stopped", is_error: true });
  expect(sentText(sent[2]!.content).endsWith("やっぱりいい")).toBe(true);
});

test("AI が本文をそのまま返したブロックは、Markdown に出しにくいもの（段組み・コールアウト・数式・手書き・文字色）も入れ替えない", async ({ page }) => {
  await mockClaudeModels(page);
  // 渡された開いているメモの本文を、そのまま返し、末尾に 1 段落だけ足す。結果が届いたら、文で答える。
  await page.route("https://api.anthropic.com/v1/messages**", async (route) => {
    if (await allowPreflight(route)) {
      return;
    }
    const body = route.request().postDataJSON() as ChatRequestBody;
    if (lastToolResults(body).length > 0) {
      await route.fulfill({ contentType: "text/event-stream", headers: { "access-control-allow-origin": "*" }, body: claudeStreamBody("足しました。") });
      return;
    }
    const sent = sentText(body.messages[body.messages.length - 1]!.content);
    const noteMarkdown = /<note id="[0-9a-f]{32}" title="[^"]*" open="true">\n([\s\S]*?)\n<\/note>/.exec(sent)![1]!;
    await route.fulfill({ contentType: "text/event-stream", headers: { "access-control-allow-origin": "*" },
      body: claudeStreamBody({ text: "", toolCalls: [{ id: "toolu_echo", name: "replace_note_body", input: { noteId: attachedNoteId(body), markdown: `${noteMarkdown}\n\nぶどう` } }] }) });
  });
  await startLocalVault(page);
  await createNoteOnDesktop(page, "いろいろなブロック");
  // Markdown に無い書式（文字色）は、画面の操作で付ける（手書きの枠にも同じ名前の色のボタンがあるので、先に付ける）。
  await page.keyboard.type("りんご");
  // 本文はまだ「りんご」だけなので、全部を選ぶ（Shift+End は、重いときに選択が間に合わないことがある）。
  await page.keyboard.press("ControlOrMeta+a");
  await page.getByRole("button", { name: "文字色" }).click();
  await page.getByRole("button", { name: "赤" }).click();
  await expect(page.locator('.ProseMirror [data-text-color="red"]')).toHaveText("りんご");
  await page.locator(".ProseMirror > p").first().click();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  // Markdown で書けるブロックは、貼り付けて作る。
  await page.locator(".ProseMirror").evaluate((editor, markdown) => {
    const transfer = new DataTransfer();
    transfer.setData("text/plain", markdown);
    editor.dispatchEvent(new ClipboardEvent("paste", { clipboardData: transfer, bubbles: true, cancelable: true }));
  }, "> [!warning]\n> 火を止める\n\n$$\nE = mc^2\n$$\n\n```sedum-drawing\n{\"strokes\":[]}\n```\n\nおわり");
  await expect(page.locator(".ProseMirror .callout")).toHaveText("火を止める");
  // Markdown で書けないブロック（段組み）は、「/」から入れる。
  await page.locator(".ProseMirror > p", { hasText: "おわり" }).click();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.keyboard.type("/だんぐみ");
  await page.getByRole("listbox", { name: "ブロックの種類" }).getByRole("option", { name: "2 段組み" }).click();
  await page.keyboard.type("左の段");
  await page.locator(".ProseMirror .column").nth(1).click();
  await page.keyboard.type("右の段");
  await expect(page.locator(".ProseMirror .column")).toHaveText(["左の段", "右の段"]);
  const blockKinds = page.locator(".ProseMirror > *");
  const kindsBefore = await blockKinds.evaluateAll((blocks) => blocks.map((block) => block.className || block.tagName));

  await enableAi(page);
  await page.getByLabel("API キー").fill("test-key");
  await saveAiSettingsAndOpenChat(page, "いろいろなブロック");
  await chat(page).getByRole("textbox", { name: "AI への発言" }).fill("最後にぶどうを足して");
  await page.keyboard.press("Enter");
  const card = approvalCard(page);
  await expect(card.getByLabel("足すブロック")).toHaveText(["ぶどう"]);
  await expect(card.getByLabel("消すブロック")).toHaveCount(0);

  await card.getByRole("button", { name: "行う", exact: true }).click();
  await expect(chat(page).locator(".ai-message.assistant .ai-message-text")).toHaveText(["足しました。"]);
  await expect(page.locator(".ProseMirror > *").last()).toHaveText("ぶどう");
  const kindsAfter = await blockKinds.evaluateAll((blocks) => blocks.map((block) => block.className || block.tagName));
  expect(kindsAfter.slice(0, kindsBefore.length)).toEqual(kindsBefore);
  await expect(page.locator('.ProseMirror [data-text-color="red"]')).toHaveText("りんご");
  await expect(page.locator(".ProseMirror .column")).toHaveText(["左の段", "右の段"]);
  await expect(page.locator(".ProseMirror .callout")).toHaveText("火を止める");
  await expect(page.locator(".ProseMirror .math-block .math-rendered")).toHaveAttribute("title", "E = mc^2");
});

test("OpenAI 互換のサーバーが道具（function calling）を断ったら、道具を外して頼み直し、ふつうに答えてもらう", async ({ page }) => {
  const requests: ChatRequestBody[] = [];
  await page.route("http://127.0.0.1:11434/v1/models", async (route) => {
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ object: "list", data: [{ id: "local-model" }] }) });
  });
  await page.route("http://127.0.0.1:11434/v1/chat/completions", async (route) => {
    const body = route.request().postDataJSON() as ChatRequestBody;
    requests.push(body);
    if (body.tools) {
      await route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ error: "tools are not supported" }) });
      return;
    }
    await route.fulfill({ contentType: "text/event-stream", body: `data: ${JSON.stringify({ choices: [{ delta: { content: "直しの案は出せませんが、こう書けます。" } }] })}\n\ndata: [DONE]\n\n` });
  });
  await startLocalVault(page);
  await createNoteOnDesktop(page, "旅行の計画");
  await page.keyboard.type("出発は 8 月 3 日。");
  await enableAi(page);
  await page.getByLabel("つなぎ先").selectOption("openAiCompatible");
  await saveAiSettingsAndOpenChat(page, "旅行の計画");
  await chat(page).getByRole("textbox", { name: "AI への発言" }).fill("このメモを直して");
  await page.keyboard.press("Enter");
  await expect(chat(page).locator(".ai-message.assistant .ai-message-text")).toHaveText(["直しの案は出せませんが、こう書けます。"]);
  expect(requests.map((body) => body.tools !== undefined)).toEqual([true, false]);
  await expect(chat(page).locator(".ai-message.assistant")).toContainText("このつなぎ先はツールに対応していないため、添えたメモだけで答えました。");
  await expect(chat(page).getByRole("alert")).toHaveCount(0);
});

test("OpenAI 互換で、1 つの答えに 2 つの呼び出しがあれば 1 枚のカードで聞き、選んだものだけを行って、結果を呼び出しごとに返す", async ({ page }) => {
  const requests: ChatRequestBody[] = [];
  const toolCallLine = (index: number, call: { id?: string; name?: string; arguments: string }) => ({
    choices: [{ delta: { tool_calls: [{ index, ...(call.id ? { id: call.id } : {}), function: { ...(call.name ? { name: call.name } : {}), arguments: call.arguments } }] } }],
  });
  await page.route("http://127.0.0.1:11434/v1/models", async (route) => {
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ object: "list", data: [{ id: "local-model" }] }) });
  });
  await page.route("http://127.0.0.1:11434/v1/chat/completions", async (route) => {
    requests.push(route.request().postDataJSON() as ChatRequestBody);
    const lines = requests.length === 1
      ? [
        toolCallLine(0, { id: "call_a", name: "create_note", arguments: '{"title":' }),
        toolCallLine(1, { id: "call_b", name: "create_note", arguments: '{"title":"やること"}' }),
        toolCallLine(0, { arguments: '"買うもの"}' }),
        { choices: [{ delta: {}, finish_reason: "tool_calls" }] },
      ]
      : [{ choices: [{ delta: { content: "1 つ作りました。" } }] }];
    await route.fulfill({ contentType: "text/event-stream", body: `${lines.map((line) => `data: ${JSON.stringify(line)}\n\n`).join("")}data: [DONE]\n\n` });
  });
  await startLocalVault(page);
  await createNoteOnDesktop(page, "メモ");
  await enableAi(page);
  await page.getByLabel("つなぎ先").selectOption("openAiCompatible");
  await saveAiSettingsAndOpenChat(page, "メモ");
  await chat(page).getByRole("textbox", { name: "AI への発言" }).fill("買うものとやることのメモを作って");
  await page.keyboard.press("Enter");

  const card = approvalCard(page);
  await expect(card.getByRole("checkbox")).toHaveCount(2);
  await card.getByRole("checkbox", { name: "メモ「やること」を作る" }).uncheck();
  await card.getByRole("button", { name: "選んだものを行う" }).click();
  await expect(chat(page).locator(".ai-message.assistant .ai-message-text")).toHaveText(["1 つ作りました。"]);
  await expect(page.locator(".tree-note", { hasText: "買うもの" })).toBeVisible();
  await expect(page.locator(".tree-note", { hasText: "やること" })).toHaveCount(0);

  const sent = requests[1]!.messages as Array<Record<string, unknown>>;
  expect(sent.slice(2).map((message) => [message.role, message.tool_call_id ?? null])).toEqual([["assistant", null], ["tool", "call_a"], ["tool", "call_b"]]);
  expect(String(sent[4]!.content)).toContain("did not approve");
});

test("本文で文字を選び、上のボタンの「AI に頼む」から訳してもらうと、答えで選んだ所を入れ替えられる", async ({ page }) => {
  const requests = await mockClaudeApi(page, ["Hello, world"]);
  await startLocalVault(page);
  await createNoteOnDesktop(page, "あいさつ");
  await page.keyboard.type("最初に、こんにちは世界、と書く。");
  await enableAi(page);
  await page.getByLabel("API キー").fill("test-key");
  await page.getByRole("button", { name: "保存して確かめる" }).click();
  await expect(page.getByRole("status").filter({ hasText: "つなぎ先につながりました" })).toBeVisible();
  await page.getByRole("tab", { name: "あいさつ" }).click();

  // 「こんにちは世界」を選ぶ。
  await page.locator(".ProseMirror").evaluate((element: HTMLElement & { editor?: { state: { doc: { textContent: string } }; commands: { setTextSelection: (range: { from: number; to: number }) => boolean; focus: () => boolean } } }) => {
    const editor = element.editor!;
    const start = editor.state.doc.textContent.indexOf("こんにちは世界") + 1;
    editor.commands.focus();
    editor.commands.setTextSelection({ from: start, to: start + "こんにちは世界".length });
  });
  const selectionToolbar = page.locator(".selection-toolbar");
  await selectionToolbar.getByRole("button", { name: "AI に頼む" }).click();
  await page.getByRole("menuitem", { name: "選んだ所を英語に訳す" }).click();

  const answers = chat(page).locator(".ai-message.assistant .ai-message-text");
  await expect(answers).toHaveText(["Hello, world"]);
  const sent = JSON.stringify(requests[0]!.body);
  expect(sent).toContain("<selection");
  expect(sent).toContain("こんにちは世界");
  expect(sent).toContain("Translate the selected text into natural English");
  expect(sent).not.toContain("最初に");

  await chat(page).getByRole("button", { name: "選んだ所と入れ替える" }).click();
  await expect(page.locator(".ProseMirror p").first()).toHaveText("最初に、Hello, world、と書く。");
  // 選んでいた所の文字が変わったあとは、入れ替えずに知らせる。
  await chat(page).getByRole("button", { name: "選んだ所と入れ替える" }).click();
  await expect(chat(page).getByRole("alert")).toContainText("選んでいた所の文字が変わったので、入れ替えませんでした");
  await expect(page.locator(".ProseMirror p").first()).toHaveText("最初に、Hello, world、と書く。");
});
