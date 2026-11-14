// AI を有効にしたあとの画面（モデルの一覧を取ったあとの設定、会話、「@」の候補、承認のカードと差分、残した会話）。
// Claude の API は外へ出さず、page.route で決まった答えを返す（モデルの一覧、要約の答え、本文の差し替えのツールの呼び出し）。

import { openSettingsOnDesktop } from "./appOperations.mjs";

const CLAUDE_API = "https://api.anthropic.com/v1";
const CORS_HEADERS = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET, POST" };
const FAKE_MODELS = [{ id: "claude-sonnet-5-5", name: "Claude Sonnet 5.5" }, { id: "claude-opus-5-5", name: "Claude Opus 5.5" }];
// 答えが届いて描かれるまでの待ち時間の目安。
const ANSWER_SETTLE_MILLISECONDS = 500;

// Claude の Messages API の、流して返す形（server-sent events）の答え。
function claudeStream({ text, toolCalls = [] }) {
  const events = [["message_start", { type: "message_start", message: { id: "msg", type: "message", role: "assistant", model: FAKE_MODELS[1].id, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 1 } } }]];
  events.push(["content_block_start", { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }],
    ["content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "text_delta", text } }],
    ["content_block_stop", { type: "content_block_stop", index: 0 }]);
  for (const [offset, call] of toolCalls.entries()) {
    const index = offset + 1;
    events.push(["content_block_start", { type: "content_block_start", index, content_block: { type: "tool_use", id: call.id, name: call.name, input: {} } }],
      ["content_block_delta", { type: "content_block_delta", index, delta: { type: "input_json_delta", partial_json: JSON.stringify(call.input) } }],
      ["content_block_stop", { type: "content_block_stop", index }]);
  }
  events.push(["message_delta", { type: "message_delta", delta: { stop_reason: toolCalls.length ? "tool_use" : "end_turn", stop_sequence: null }, usage: { output_tokens: 12 } }],
    ["message_stop", { type: "message_stop" }]);
  return events.map(([name, payload]) => `event: ${name}\ndata: ${JSON.stringify(payload)}\n\n`).join("");
}

// 1 回目の発言には要約を、2 回目には本文の差し替え（承認のカードが出る）を返す。
async function routeFakeClaude(page) {
  await page.route(`${CLAUDE_API}/models**`, async (route) => {
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS_HEADERS });
    const data = FAKE_MODELS.map((model) => ({ type: "model", id: model.id, display_name: model.name, created_at: "2026-11-01T00:00:00Z", max_input_tokens: 1000000, max_tokens: 32000 }));
    return route.fulfill({ contentType: "application/json", headers: CORS_HEADERS, body: JSON.stringify({ data, has_more: false, first_id: data[0].id, last_id: data[1].id }) });
  });
  let answered = 0;
  await page.route(`${CLAUDE_API}/messages**`, async (route) => {
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS_HEADERS });
    answered += 1;
    const noteId = /<note id=\\?"([0-9a-f]{32})/.exec(JSON.stringify(route.request().postDataJSON().messages))?.[1];
    const answer = answered === 1
      ? { text: "このメモの要点は次のとおりです。\n\n- 書式とブロックの見本\n- 表・コード・数式・図を含む\n- 最後に脚注がある" }
      : { text: "誤字を直し、最後に 1 行足します。", toolCalls: [{ id: "toolu_edit", name: "replace_note_body", input: { noteId, markdown: "## 見出し 2 の行\n\n見出しのあとの段落。長い文が折り返したときの行間を確かめます。\n\n最後に足した行。" } }] };
    return route.fulfill({ contentType: "text/event-stream", headers: CORS_HEADERS, body: claudeStream(answer) });
  });
}

const chatRegion = (page) => page.getByRole("region", { name: "AI チャット" });
const chatInput = (page) => chatRegion(page).getByRole("textbox", { name: "AI への発言" });

// openNote は、会話の相手にするメモを開く関数（auditScreens.mjs の見た目の確認のメモ）。
export function AI_CHAT_SCREENS({ openNote }) {
  return [
    {
      name: "settings-ai-models-loaded",
      open: async (page) => {
        await routeFakeClaude(page);
        await openSettingsOnDesktop(page, "AI");
        await page.getByRole("checkbox", { name: "アプリ内の AI を使う" }).check();
        // 前の画面で選んだつなぎ先（OpenAI 互換）から、Claude に戻す。
        await page.getByLabel("つなぎ先").selectOption({ index: 0 });
        await page.getByLabel("API キー").fill("visual-audit-not-a-key");
        await page.getByRole("button", { name: "保存して接続を確認" }).click();
        await page.getByRole("status").filter({ hasText: "つなぎ先につながりました" }).waitFor();
      },
    },
    {
      name: "ai-chat-conversation",
      open: async (page) => {
        await openNote(page);
        await page.keyboard.press("Control+Alt+A");
        await chatRegion(page).getByRole("button", { name: "要約する" }).click();
        await page.locator(".ai-message.assistant").first().waitFor();
        await page.waitForTimeout(ANSWER_SETTLE_MILLISECONDS);
      },
      close: async () => {},
    },
    {
      name: "ai-chat-mention-picker",
      open: async (page) => {
        await chatInput(page).click();
        await page.keyboard.type("@沖");
      },
      close: async (page) => { await page.keyboard.press("Escape"); await chatInput(page).fill(""); },
    },
    {
      name: "ai-chat-approval-card",
      open: async (page) => {
        await chatInput(page).fill("誤字を直して、最後に 1 行足して");
        await page.keyboard.press("Enter");
        await chatRegion(page).getByRole("group", { name: "承認を待っている操作" }).waitFor();
        await page.waitForTimeout(ANSWER_SETTLE_MILLISECONDS);
      },
      close: async () => {},
    },
    {
      name: "ai-chat-saved-chats",
      open: async (page) => {
        const stop = chatRegion(page).getByRole("button", { name: /止める/ });
        if (await stop.count()) await stop.first().click();
        await chatRegion(page).getByRole("button", { name: "新しい会話" }).click();
        await chatRegion(page).getByRole("button", { name: "残した会話" }).click();
      },
      close: async (page) => { await page.keyboard.press("Control+Alt+A"); },
    },
  ];
}
