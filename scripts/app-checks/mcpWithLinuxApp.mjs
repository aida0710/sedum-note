// 組み立てた Linux のアプリの MCP の窓口へ、本物の HTTP で要求を送って確かめる。手で流す確認の道具。
//
// 前提: scripts/app-checks/linux/build-app.sh のあと run-built-app-driver.sh（tauri-driver が 127.0.0.1:14444）。
// 使い方: node scripts/app-checks/mcpWithLinuxApp.mjs <画像を置くフォルダ>
//
// 確かめること:
//   1. 設定で有効にすると窓口が開き、トークンなし・違うトークン・Web ページからの要求（Origin つき）を断る
//   2. MCP の手順（server/discover、tools/list、tools/call）で、メモの作成・検索・読み取り・書き換え・ゴミ箱が通る
//   3. 有効のまま設定（完全な削除を許す、トークンの作り直し）を変えても、窓口が開き直る
//   4. 窓の最小化を頼んだあとも応答が返る（Xvfb には窓の管理が無いので、実際に最小化されているかは分からない）
//   5. アプリをロックすると窓口が閉じる

import { writeFileSync } from "node:fs";
import { connect } from "node:net";
import { PASSPHRASE } from "./checkDevices.mjs";
import { WebDriverSession } from "./webDriverSession.mjs";

const outputDirectory = process.argv[2];
const MCP_PORT = 47821;
const ENDPOINT = `http://127.0.0.1:${MCP_PORT}/mcp`;
const PROTOCOL_VERSION = "2026-07-28";

const app = await WebDriverSession.start("http://127.0.0.1:14444", { browserName: "wry", "tauri:options": { application: "/app/sedum-note" } });
const execute = (script) => app.command("POST", "/execute/sync", { script, args: [] });
const clickButton = async (text) => app.click(await app.waitForXPath(`//button[normalize-space()='${text}']`, 30_000));
const pause = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

let nextId = 1;
async function post(method, params, { token, extraHeaders = {} }) {
  const headers = {
    "Content-Type": "application/json", Accept: "application/json, text/event-stream",
    "MCP-Protocol-Version": PROTOCOL_VERSION, "Mcp-Method": method, ...extraHeaders,
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  if (method === "tools/call") {
    headers["Mcp-Name"] = params.name;
  }
  const meta = { "io.modelcontextprotocol/protocolVersion": PROTOCOL_VERSION, "io.modelcontextprotocol/clientInfo": { name: "sedum-note-check", version: "1" }, "io.modelcontextprotocol/clientCapabilities": {} };
  const response = await fetch(ENDPOINT, { method: "POST", headers, body: JSON.stringify({ jsonrpc: "2.0", id: nextId++, method, params: { ...params, _meta: meta } }) });
  const text = await response.text();
  return { status: response.status, message: text === "" ? null : JSON.parse(text) };
}
function expect(condition, description) {
  if (!condition) {
    throw new Error(`failed: ${description}`);
  }
  console.log(`ok: ${description}`);
}

try {
  // コンテナの言語は英語なので、道具が使う日本語の文言にそろえる。
  await app.waitForXPath("//input[@type='password']", 30_000);
  await execute(`localStorage.setItem("sedum-note:devicePreferences", JSON.stringify({ language: "ja", checkForUpdates: false })); location.reload();`);
  await pause(3_000);
  await app.type(await app.waitForXPath("//input[@id='setup-passphrase']", 30_000), PASSPHRASE);
  await app.type(await app.find("#setup-passphrase-confirm"), PASSPHRASE);
  await clickButton("作成");
  // MCP の欄は、設定の AI のページにある。
  await app.click(await app.waitForXPath("//button[@aria-label='設定']", 60_000));
  await app.click(await app.waitForXPath("//nav[@aria-label='設定のページ']//button[normalize-space(.)='AI']", 30_000));
  await app.click(await app.waitForXPath("//label[contains(., 'MCPサーバーを起動する')]/input", 30_000));
  await clickButton("トークンを表示");
  await pause(1_000);
  let token = /Bearer ([0-9a-f]{64})/.exec(await execute(`return document.querySelector(".settings").innerText`))?.[1];
  expect(Boolean(token), "the settings screen shows a 256-bit token");
  writeFileSync(`${outputDirectory}/mcp-settings.png`, await app.screenshotPng());

  // 1. 断るもの。
  expect((await post("server/discover", {}, {})).status === 401, "a request without a token is refused with 401");
  expect((await post("server/discover", {}, { token: "0".repeat(64) })).status === 401, "a wrong token is refused with 401");
  expect((await post("server/discover", {}, { token, extraHeaders: { Origin: "https://example.com" } })).status === 403, "a request from a web page (with Origin) is refused with 403");
  expect((await fetch(ENDPOINT, { headers: { Authorization: `Bearer ${token}` } })).status === 405, "GET is refused with 405");

  // 2. MCP の手順。
  const discovered = await post("server/discover", {}, { token });
  expect(discovered.status === 200 && discovered.message.result.supportedVersions.includes(PROTOCOL_VERSION), "server/discover answers with the supported version");
  const tools = (await post("tools/list", {}, { token })).message.result.tools.map((tool) => tool.name);
  expect(tools.includes("create_note") && tools.includes("replace_note_body") && !tools.includes("delete_note_permanently"), `tools/list returns the note tools (${tools.length}), without permanent deletion by default`);
  const callTool = async (name, toolArguments) => {
    const { status, message } = await post("tools/call", { name, arguments: toolArguments }, { token });
    if (status !== 200 || message.result.isError) {
      throw new Error(`${name} failed: ${JSON.stringify(message)}`);
    }
    return JSON.parse(message.result.content[0].text);
  };
  const created = await callTool("create_note", { title: "MCP から作ったメモ", markdown: "## 見出し\n\n本文です。" });
  const found = await callTool("search_notes", { query: "本文です" });
  expect(found.notes.some((note) => note.noteId === created.noteId), "a note created through MCP is found by search");
  await app.waitForXPath("//button[contains(., 'MCP から作ったメモ')]", 15_000);
  console.log("ok: the created note appears in the app window");
  await callTool("replace_note_body", { noteId: created.noteId, markdown: "書き換えた本文" });
  await callTool("append_to_note", { noteId: created.noteId, markdown: "- 追記した行" });
  const read = await callTool("get_note", { noteId: created.noteId });
  expect(read.markdown.includes("書き換えた本文") && read.markdown.includes("- 追記した行"), "the body can be replaced, appended to and read back");
  expect((await callTool("move_note_to_trash", { noteId: created.noteId })).inTrash === true, "a note can be moved to the trash");
  expect((await callTool("restore_note_from_trash", { noteId: created.noteId })).inTrash === false, "and restored");

  // 有効のまま設定を変えても、窓口が開き直る。
  await app.click(await app.waitForXPath("//label[contains(., '完全な削除も許可する')]/input", 10_000));
  await pause(1_500);
  const toolsAfterAllowing = (await post("tools/list", {}, { token })).message.result.tools.map((tool) => tool.name);
  expect(toolsAfterAllowing.includes("delete_note_permanently"), "after allowing permanent deletion, the endpoint reopens with that tool");
  await clickButton("トークンを再生成");
  await pause(1_500);
  const renewedToken = /Bearer ([0-9a-f]{64})/.exec(await execute(`return document.querySelector(".settings").innerText`))?.[1];
  expect(renewedToken !== token && (await post("server/discover", {}, { token })).status === 401, "after renewing the token, the old token is refused");
  expect((await post("server/discover", {}, { token: renewedToken })).status === 200, "and the new token is accepted");
  token = renewedToken;

  // 3. 窓を最小化した状態。
  await app.command("POST", "/window/minimize", {});
  await pause(5_000);
  const startedAt = Date.now();
  const whileMinimized = await callTool("search_notes", {});
  expect(whileMinimized.totalCount === 1, `a request is answered after asking to minimize the window (${Date.now() - startedAt} ms)`);
  await app.command("POST", "/window/maximize", {});

  // 4. ロックすると閉じる。
  await clickButton("ロック");
  await pause(1_500);
  // 閉じたかは、接続そのものを試して確かめる（fetch は、前の要求の接続を使い回して待ち続けることがある）。
  const afterLock = await new Promise((resolve) => {
    const socket = connect({ host: "127.0.0.1", port: MCP_PORT });
    socket.once("connect", () => { socket.destroy(); resolve("connected"); });
    socket.once("error", (error) => resolve(error.code));
  });
  expect(afterLock === "ECONNREFUSED", "after locking the app, the endpoint is closed (connections are refused)");
} finally {
  await app.end().catch(() => undefined);
}
