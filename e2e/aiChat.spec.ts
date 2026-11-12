import { expect, type Page, type Route, test } from "@playwright/test";
import { createNoteOnDesktop, openSettingsPage, PASSPHRASE, startLocalVault } from "./devices";

// 試験では AI の提供元へつながない。届いた要求を覚えて、ストリーミングの形の決まった答えを返す。

type ChatRequestBody = { model: string; max_tokens?: number; stream: boolean; fallbacks?: unknown; tools?: Array<{ name: string }>; messages: Array<{ role: string; content: string }> };

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

// 直しの案（propose_note_edit の呼び出し）を含む答え。
type EditAnswer = { text: string; edit: { id: string; markdown: string; summary: string } };

// Claude の API のストリーミングの形（Server-Sent Events）で、答えの文を 2 つに分けて返す。
// 直しの案があれば、そのあとに道具の呼び出しの入力を 2 つに分けて返す。
function claudeStreamBody(answer: string | EditAnswer): string {
  const text = typeof answer === "string" ? answer : answer.text;
  const half = Math.ceil(text.length / 2);
  const events: Array<[string, object]> = [
    ["message_start", { type: "message_start", message: { id: "msg_test", type: "message", role: "assistant", model: "claude-opus-5-5", content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 1 } } }],
    ["content_block_start", { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }],
    ["content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: text.slice(0, half) } }],
    ["content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: text.slice(half) } }],
    ["content_block_stop", { type: "content_block_stop", index: 0 }],
  ];
  if (typeof answer !== "string") {
    const input = JSON.stringify({ markdown: answer.edit.markdown, summary: answer.edit.summary });
    const inputHalf = Math.ceil(input.length / 2);
    events.push(
      ["content_block_start", { type: "content_block_start", index: 1, content_block: { type: "tool_use", id: answer.edit.id, name: "propose_note_edit", input: {} } }],
      ["content_block_delta", { type: "content_block_delta", index: 1, delta: { type: "input_json_delta", partial_json: input.slice(0, inputHalf) } }],
      ["content_block_delta", { type: "content_block_delta", index: 1, delta: { type: "input_json_delta", partial_json: input.slice(inputHalf) } }],
      ["content_block_stop", { type: "content_block_stop", index: 1 }],
    );
  }
  events.push(
    ["message_delta", { type: "message_delta", delta: { stop_reason: typeof answer === "string" ? "end_turn" : "tool_use", stop_sequence: null }, usage: { output_tokens: 12 } }],
    ["message_stop", { type: "message_stop" }],
  );
  return events.map(([name, data]) => `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`).join("");
}

// Claude の API の代わり。届いた要求を覚え、answers を順に返す。
async function mockClaudeApi(page: Page, answers: Array<string | EditAnswer>): Promise<Array<{ headers: Record<string, string>; body: ChatRequestBody }>> {
  const requests: Array<{ headers: Record<string, string>; body: ChatRequestBody }> = [];
  await mockClaudeModels(page);
  await page.route("https://api.anthropic.com/v1/messages**", async (route) => {
    if (await allowPreflight(route)) {
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
  expect(requests[0]!.body.messages[0]!.content).toContain('<note title="買い物" open="true">');
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
  await expect(chat(page).getByRole("listbox", { name: "指定するメモ" }).getByRole("option")).toHaveText(["旅行の計画"]);
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
  expect(requests[0]!.body.messages[1]!.content).toContain("出発はいつ？");

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
  expect(requests[1]!.body.messages[0]!.content).toContain("出発は 8 月 3 日の朝 9 時。");
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

const FRUIT_EDIT: EditAnswer = { text: "誤字を直しました。", edit: { id: "toolu_fruit", markdown: "りんご\n\nバナナ\n\nみかん\n\nぶどう", summary: "「ばなな」を直し、ぶどうを足す" } };

test("開いているメモの直しを頼むと、差分を見せ、適用すると直したブロックだけが入れ替わる。直していないブロックの文字色は残る", async ({ page }) => {
  const requests = await mockClaudeApi(page, [FRUIT_EDIT, "どういたしまして。"]);
  await openChatOnFruitNote(page);
  const input = chat(page).getByRole("textbox", { name: "AI への発言" });
  await input.fill("誤字を直して、ぶどうも足して");
  await page.keyboard.press("Enter");

  const card = chat(page).getByLabel("メモの直しの案");
  await expect(card).toContainText("「ばなな」を直し、ぶどうを足す");
  await expect(card.getByLabel("消すブロック")).toHaveText(["ばなな"]);
  await expect(card.getByLabel("足すブロック")).toHaveText(["バナナ", "ぶどう"]);
  await expect(card.locator(".ai-edit-unchanged")).toHaveText(["変更のないブロック 1 個", "変更のないブロック 1 個"]);
  // 案を見ただけでは、メモは変わらない。
  await expect(page.locator(".ProseMirror p")).toHaveText(["りんご", "ばなな", "みかん"]);
  expect(requests[0]!.body.tools?.map((tool) => tool.name)).toEqual(["propose_note_edit"]);
  expect(requests[0]!.body.messages[0]!.content).toContain('<note title="果物" open="true">');

  await card.getByRole("button", { name: "適用する" }).click();
  await expect(page.locator(".ProseMirror p")).toHaveText(["りんご", "バナナ", "みかん", "ぶどう"]);
  await expect(page.locator('.ProseMirror [data-text-color="red"]')).toHaveText("りんご");
  await expect(card).toContainText("適用しました。適用する前の状態は、メモの履歴に残っています。");

  // 次の発言では、案を適用したことを AI に伝える。
  await input.fill("ありがとう");
  await page.keyboard.press("Enter");
  await expect(chat(page).locator(".ai-message.assistant .ai-message-text")).toHaveText(["誤字を直しました。", "どういたしまして。"]);
  const followUp = requests[1]!.body.messages as unknown as Array<{ role: string; content: Array<Record<string, unknown>> }>;
  expect(followUp[1]!.content).toContainEqual({ type: "tool_use", id: "toolu_fruit", name: "propose_note_edit", input: { markdown: "(omitted from the history)", summary: "「ばなな」を直し、ぶどうを足す" } });
  expect(followUp[2]!.content[0]).toEqual({ type: "tool_result", tool_use_id: "toolu_fruit", content: "The user applied the edit. The open note now contains it." });

  // 適用する前の状態は、メモの履歴に残る。
  await page.getByRole("button", { name: "その他の操作" }).last().click();
  await page.getByRole("menuitem", { name: "履歴" }).click();
  await expect(page.getByRole("dialog", { name: "履歴" }).getByRole("option").first()).toContainText("本文の置き換えの前（AI・MCP・プラグイン）");
});

test("案を出したあとでメモを書き換えると、その案は使えない。承認を待たずに適用する設定なら、案をすぐ適用する", async ({ page }) => {
  await mockClaudeApi(page, [FRUIT_EDIT, { ...FRUIT_EDIT, edit: { ...FRUIT_EDIT.edit, id: "toolu_auto" } }]);
  await openChatOnFruitNote(page);
  const input = chat(page).getByRole("textbox", { name: "AI への発言" });
  await input.fill("直して");
  await page.keyboard.press("Enter");
  const firstCard = chat(page).getByLabel("メモの直しの案").first();
  await expect(firstCard.getByRole("button", { name: "適用する" })).toBeVisible();

  await page.locator(".ProseMirror p").last().click();
  await page.keyboard.press("End");
  await page.keyboard.type("とレモン");
  await firstCard.getByRole("button", { name: "適用する" }).click();
  await expect(firstCard).toContainText("案を出したあとでメモが変わったので、この案は使えません。");
  await expect(page.locator(".ProseMirror p")).toHaveText(["りんご", "ばなな", "みかんとレモン"]);

  await chat(page).getByRole("checkbox", { name: "直しの案を、承認を待たずに適用する" }).check();
  await page.locator(".ProseMirror p").last().click();
  await page.keyboard.press("End");
  for (let character = 0; character < "とレモン".length; character += 1) {
    await page.keyboard.press("Backspace");
  }
  await expect(page.locator(".ProseMirror p")).toHaveText(["りんご", "ばなな", "みかん"]);
  await input.fill("もう一度直して");
  await page.keyboard.press("Enter");
  await expect(page.locator(".ProseMirror p")).toHaveText(["りんご", "バナナ", "みかん", "ぶどう"]);
  await expect(chat(page).getByLabel("メモの直しの案").last()).toContainText("適用しました。");
});
