import { describe, expect, it } from "vitest";
import { handleMcpRequest, MCP_PROTOCOL_VERSION, type McpServerDefinition, McpToolError } from "./mcpServer";

const server: McpServerDefinition = {
  name: "sedum-note",
  version: "0.2.0",
  instructions: "notes",
  tools: [
    {
      name: "echo", title: "Echo", description: "returns the text", readOnly: true, destructive: false,
      inputSchema: { type: "object", properties: { text: { type: "string" } }, required: ["text"] },
      run: async (toolArguments) => {
        if (typeof toolArguments.text !== "string") {
          throw new McpToolError("text must be a string");
        }
        return { echoed: toolArguments.text };
      },
    },
  ],
};

const META = {
  "io.modelcontextprotocol/protocolVersion": MCP_PROTOCOL_VERSION,
  "io.modelcontextprotocol/clientInfo": { name: "test", version: "1" },
  "io.modelcontextprotocol/clientCapabilities": {},
};

async function call(method: string, params: Record<string, unknown> = {}, headers: Record<string, string> = {}) {
  const response = await handleMcpRequest({
    headers: { "mcp-protocol-version": MCP_PROTOCOL_VERSION, "mcp-method": method, ...headers },
    body: JSON.stringify({ jsonrpc: "2.0", id: 7, method, params: { _meta: META, ...params } }),
  }, server);
  return { status: response.status, message: response.body === "" ? null : JSON.parse(response.body) };
}

describe("handleMcpRequest", () => {
  it("server/discover で、対応する版とツールを持つことを答える", async () => {
    const { status, message } = await call("server/discover");
    expect(status).toBe(200);
    expect(message.id).toBe(7);
    expect(message.result).toMatchObject({
      resultType: "complete", supportedVersions: [MCP_PROTOCOL_VERSION], capabilities: { tools: {} }, instructions: "notes",
      _meta: { "io.modelcontextprotocol/serverInfo": { name: "sedum-note", version: "0.2.0" } },
    });
  });

  it("tools/list で、ツールの名前・説明・引数の形・読むだけかどうかを返す", async () => {
    const { message } = await call("tools/list");
    expect(message.result.tools).toEqual([{
      name: "echo", title: "Echo", description: "returns the text",
      inputSchema: { type: "object", properties: { text: { type: "string" } }, required: ["text"] },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    }]);
  });

  it("tools/call で、ツールの結果を文字で返す", async () => {
    const { status, message } = await call("tools/call", { name: "echo", arguments: { text: "こんにちは" } }, { "mcp-name": "echo" });
    expect(status).toBe(200);
    expect(message.result.isError).toBe(false);
    expect(JSON.parse(message.result.content[0].text)).toEqual({ echoed: "こんにちは" });
  });

  it("ツールの中の失敗は、失敗した結果として返す", async () => {
    const { status, message } = await call("tools/call", { name: "echo", arguments: {} }, { "mcp-name": "echo" });
    expect(status).toBe(200);
    expect(message.result).toMatchObject({ isError: true, content: [{ type: "text", text: "text must be a string" }] });
  });

  it("知らないツールと知らないメソッドを断る", async () => {
    expect(await call("tools/call", { name: "nope" }, { "mcp-name": "nope" })).toMatchObject({ status: 400, message: { error: { code: -32602 } } });
    expect(await call("resources/list")).toMatchObject({ status: 404, message: { error: { code: -32601 } } });
  });

  it("ヘッダーと本文が食い違う要求を断る", async () => {
    expect(await call("tools/list", {}, { "mcp-method": "tools/call" })).toMatchObject({ status: 400, message: { error: { code: -32020 } } });
    expect(await call("tools/list", {}, { "mcp-protocol-version": "2025-11-25" })).toMatchObject({ status: 400, message: { error: { code: -32020 } } });
    expect(await call("tools/call", { name: "echo", arguments: { text: "a" } }, { "mcp-name": "other" })).toMatchObject({ status: 400, message: { error: { code: -32020 } } });
  });

  it("対応していない版と、initialize で始める以前の版のクライアントには、対応する版を伝えて断る", async () => {
    const olderMeta = { ...META, "io.modelcontextprotocol/protocolVersion": "2025-11-25" };
    const older = await call("tools/list", { _meta: olderMeta }, { "mcp-protocol-version": "2025-11-25" });
    expect(older).toMatchObject({ status: 400, message: { error: { code: -32022, data: { supported: [MCP_PROTOCOL_VERSION], requested: "2025-11-25" } } } });
    const legacy = await handleMcpRequest({
      headers: {}, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } }),
    }, server);
    expect(JSON.parse(legacy.body).error).toMatchObject({ code: -32022, data: { supported: [MCP_PROTOCOL_VERSION] } });
  });

  it("JSON でない本文と、版を名乗らない要求を断る。応答の要らない知らせは受け取るだけ", async () => {
    expect((await handleMcpRequest({ headers: {}, body: "not json" }, server)).status).toBe(400);
    const withoutMeta = await handleMcpRequest({
      headers: { "mcp-method": "tools/list" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    }, server);
    expect(JSON.parse(withoutMeta.body).error.code).toBe(-32602);
    const notification = await handleMcpRequest({ headers: {}, body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/whatever" }) }, server);
    expect(notification).toEqual({ status: 202, body: "" });
  });
});
