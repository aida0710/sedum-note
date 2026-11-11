// アプリの Rust 側の MCP の窓口（src-tauri/src/mcp_gateway.rs）を、画面から始める・止める。
// 窓口があるのは PC 版（デスクトップのアプリ）だけで、このファイルを使うコードも PC 版にだけ同梱する。

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { McpHttpRequest, McpHttpResponse } from "../../core/mcp/mcpServer";

// mcp_gateway.rs の REQUEST_EVENT と揃える。
const REQUEST_EVENT = "mcp-request";
// 待ち受けるポート。クライアントの設定に書くので、起動のたびに変わらないよう決め打ちにする。
// ほかのよく使われるソフトと重ならない番号を選んだ。
export const MCP_PORT = 47821;
export const MCP_ENDPOINT_URL = `http://127.0.0.1:${MCP_PORT}/mcp`;

type ForwardedRequest = { requestId: number; headers: Record<string, string>; body: string };

// 窓口を開き、届いた要求を handle に渡して応答を返す。返り値を呼ぶと止まる。
// ポートがほかのプログラムに使われているときなどは、理由を投げる。
export async function startMcpGateway(token: string, handle: (request: McpHttpRequest) => Promise<McpHttpResponse>): Promise<() => Promise<void>> {
  const stopListening = await listen<ForwardedRequest>(REQUEST_EVENT, ({ payload }) => {
    void handle({ headers: payload.headers, body: payload.body })
      .catch((error): McpHttpResponse => ({ status: 500, body: JSON.stringify({ error: String(error) }) }))
      .then((response) => invoke("mcp_respond", { requestId: payload.requestId, status: response.status, body: response.body }));
  });
  let generation: number;
  try {
    generation = await invoke<number>("mcp_start", { port: MCP_PORT, token });
  } catch (error) {
    stopListening();
    throw new Error(String(error));
  }
  return async () => {
    stopListening();
    // 自分が開いた待ち受けだけを止める（設定を変えて開き直したあとの、新しい待ち受けを止めない）。
    await invoke("mcp_stop", { generation });
  };
}

// 開いている窓口のトークンを差し替える。窓口は開いたままにする。
export async function setMcpGatewayToken(token: string): Promise<void> {
  await invoke("mcp_set_token", { token });
}

// 画面を読み込み直したあとに、前の画面が開いた窓口が残っていれば止める。
export async function stopMcpGateway(): Promise<void> {
  await invoke("mcp_stop");
}
