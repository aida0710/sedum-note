import "fake-indexeddb/auto";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { describe, expect, it } from "vitest";
import { handleMcpRequest, MCP_PROTOCOL_VERSION } from "../../core/mcp/mcpServer";
import { newTestRepository } from "../../core/notes/repositoryFixtures";
import { createNoteTools, NOTE_SERVER_INSTRUCTIONS } from "./noteTools";

// MCP の公式のクライアントを、HTTP を通さずにこのアプリのサーバーの処理へつなぐ。
// 仕様の読み違いは、自分で書いた要求では見つからない（サーバーと同じ読み違いをするため）。
async function connectOfficialClient(mode: "auto" | "legacy") {
  const { repository } = await newTestRepository();
  const server = { name: "sedum-note", version: "test", instructions: NOTE_SERVER_INSTRUCTIONS, tools: createNoteTools(repository, { allowPermanentDelete: false }) };
  const serveInProcess: typeof fetch = async (_url, init) => {
    const headers = Object.fromEntries([...new Headers(init?.headers).entries()].map(([name, value]) => [name.toLowerCase(), value]));
    const response = await handleMcpRequest({ headers, body: String(init?.body ?? "") }, server);
    return new Response(response.body === "" ? null : response.body, { status: response.status, headers: { "Content-Type": "application/json" } });
  };
  const client = new Client({ name: "official-client", version: "1.0.0" }, { versionNegotiation: { mode } });
  const connected = client.connect(new StreamableHTTPClientTransport(new URL("http://127.0.0.1:47821/mcp"), { fetch: serveInProcess }));
  return { client, connected, repository };
}

function resultOf(toolResult: { content?: unknown }): any {
  return JSON.parse((toolResult.content as Array<{ text: string }>)[0]!.text);
}

describe("MCP の公式のクライアント", () => {
  it("最新の手順（server/discover）でつながり、ツールの一覧・作成・読み取り・失敗の結果が通る", async () => {
    const { client, connected, repository } = await connectOfficialClient("auto");
    await connected;
    expect(client.getNegotiatedProtocolVersion()).toBe(MCP_PROTOCOL_VERSION);
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name)).toContain("replace_note_body");
    expect(tools.find((tool) => tool.name === "search_notes")?.annotations?.readOnlyHint).toBe(true);

    const created = resultOf(await client.callTool({ name: "create_note", arguments: { title: "公式のクライアントから", markdown: "## 見出し\n\n本文" } }));
    expect(repository.note(created.noteId)?.content.title).toBe("公式のクライアントから");
    expect(resultOf(await client.callTool({ name: "get_note", arguments: { noteId: created.noteId } })).markdown).toContain("## 見出し");

    const missing = await client.callTool({ name: "get_note", arguments: { noteId: "0".repeat(32) } });
    expect(missing.isError).toBe(true);
    await client.close();
  });

  it("以前の手順（initialize）のクライアントは、つながらない", async () => {
    const { connected } = await connectOfficialClient("legacy");
    await expect(connected).rejects.toThrow();
  });
});
