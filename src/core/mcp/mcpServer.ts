// MCP（Model Context Protocol）のサーバーの、ツールだけの最小の実装。
//
// 対応するのは仕様 2026-07-28 の Streamable HTTP だけ（要求ごとに版を名乗る形。initialize で始める
// 以前の版には対応しない）。HTTP の待ち受けはアプリの Rust 側（src-tauri/src/mcp_gateway.rs）が行い、
// ここは「ヘッダーと本文を受け取って、状態と本文を返す」だけなので、HTTP なしで試験できる。
//
// 仕様: https://modelcontextprotocol.io/specification/2026-07-28

export const MCP_PROTOCOL_VERSION = "2026-07-28";

const PROTOCOL_VERSION_META = "io.modelcontextprotocol/protocolVersion";
const CLIENT_CAPABILITIES_META = "io.modelcontextprotocol/clientCapabilities";
const SERVER_INFO_META = "io.modelcontextprotocol/serverInfo";

// JSON-RPC と MCP が決めている失敗の番号。
const PARSE_ERROR = -32700;
const INVALID_REQUEST = -32600;
const METHOD_NOT_FOUND = -32601;
const INVALID_PARAMS = -32602;
const HEADER_MISMATCH = -32020;
const UNSUPPORTED_PROTOCOL_VERSION = -32022;

// サーバーの説明（対応する版と、ツールを持つこと）を使い回してよい時間（ミリ秒）。アプリの版ごとに決まっているので長くてよい。
const DISCOVERY_TTL_MILLISECONDS = 3_600_000;

type JsonObject = Record<string, unknown>;

export type McpTool = {
  name: string;
  title: string;
  description: string;
  // 引数の JSON Schema（type は object）。
  inputSchema: JsonObject;
  // 読むだけのツールは true。クライアントが確認の出し方を決めるのに使う。
  readOnly: boolean;
  // 元に戻せない変更をするツールは true。
  destructive: boolean;
  // 結果は JSON にできる値。失敗は McpToolError を投げる。
  run: (toolArguments: JsonObject) => Promise<unknown>;
};

// ツールの中で、呼び出し側に伝える失敗（引数が違う、対象が無い、など）。
export class McpToolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "McpToolError";
  }
}

export type McpServerDefinition = {
  name: string;
  version: string;
  // クライアント（AI）に渡す、このサーバーの使い方。
  instructions: string;
  tools: McpTool[];
};

// ヘッダーの名前は小文字。
export type McpHttpRequest = { headers: Record<string, string>; body: string };
// body が空なら本文なし。
export type McpHttpResponse = { status: number; body: string };

export async function handleMcpRequest(request: McpHttpRequest, server: McpServerDefinition): Promise<McpHttpResponse> {
  let message: JsonObject;
  try {
    const parsed: unknown = JSON.parse(request.body);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return failure(400, null, INVALID_REQUEST, "the body must be a single JSON-RPC message");
    }
    message = parsed as JsonObject;
  } catch {
    return failure(400, null, PARSE_ERROR, "the body is not JSON");
  }
  const id = message.id ?? null;
  const method = message.method;
  if (typeof method !== "string") {
    return failure(400, id, INVALID_REQUEST, "the message has no method");
  }
  // 応答の要らない知らせ。この版の HTTP では決まった知らせは無いが、受け取って捨てる。
  if (id === null) {
    return { status: 202, body: "" };
  }
  const supported = { supported: [MCP_PROTOCOL_VERSION] };
  if (method === "initialize") {
    return failure(400, id, UNSUPPORTED_PROTOCOL_VERSION, "this server speaks only the protocol versions without the initialize handshake", {
      ...supported, requested: String((message.params as JsonObject | undefined)?.protocolVersion ?? ""),
    });
  }
  const params = isObject(message.params) ? message.params : {};
  const meta = isObject(params._meta) ? params._meta : {};
  const requestedVersion = meta[PROTOCOL_VERSION_META];
  if (typeof requestedVersion !== "string" || !isObject(meta[CLIENT_CAPABILITIES_META])) {
    return failure(400, id, INVALID_PARAMS, `params._meta must carry ${PROTOCOL_VERSION_META} and ${CLIENT_CAPABILITIES_META}`);
  }
  if (request.headers["mcp-protocol-version"] !== requestedVersion) {
    return failure(400, id, HEADER_MISMATCH, "the MCP-Protocol-Version header does not match the request");
  }
  if (requestedVersion !== MCP_PROTOCOL_VERSION) {
    return failure(400, id, UNSUPPORTED_PROTOCOL_VERSION, "Unsupported protocol version", { ...supported, requested: requestedVersion });
  }
  if (request.headers["mcp-method"] !== method) {
    return failure(400, id, HEADER_MISMATCH, "the Mcp-Method header does not match the request");
  }
  const serverInfo = { [SERVER_INFO_META]: { name: server.name, version: server.version } };
  const success = (result: JsonObject): McpHttpResponse =>
    ({ status: 200, body: JSON.stringify({ jsonrpc: "2.0", id, result: { resultType: "complete", ...result, _meta: serverInfo } }) });

  switch (method) {
    case "server/discover":
      return success({
        supportedVersions: [MCP_PROTOCOL_VERSION],
        capabilities: { tools: {} },
        instructions: server.instructions,
        ttlMs: DISCOVERY_TTL_MILLISECONDS,
        // 利用者ごとの中身は入っていないが、この窓口はトークンを持つ 1 人のものなので、共有させない。
        cacheScope: "private",
      });
    case "tools/list":
      // ツールの一覧は設定（完全な削除を許すか）で変わるので、クライアントに使い回させない。
      return success({ tools: server.tools.map(describeTool), ttlMs: 0, cacheScope: "private" });
    case "tools/call": {
      const tool = server.tools.find((candidate) => candidate.name === params.name);
      if (!tool) {
        return failure(400, id, INVALID_PARAMS, `Unknown tool: ${String(params.name)}`);
      }
      if (request.headers["mcp-name"] !== tool.name) {
        return failure(400, id, HEADER_MISMATCH, "the Mcp-Name header does not match the request");
      }
      return success(await callTool(tool, isObject(params.arguments) ? params.arguments : {}));
    }
    default:
      return failure(404, id, METHOD_NOT_FOUND, `Unknown method: ${method}`);
  }
}

function describeTool(tool: McpTool): JsonObject {
  return {
    name: tool.name,
    title: tool.title,
    description: tool.description,
    inputSchema: tool.inputSchema,
    annotations: { readOnlyHint: tool.readOnly, destructiveHint: tool.destructive, openWorldHint: false },
  };
}

// ツールの中の失敗は、プロトコルの失敗ではなく「失敗した結果」として返す（AI が読んで直せるように）。
async function callTool(tool: McpTool, toolArguments: JsonObject): Promise<JsonObject> {
  try {
    const result = await tool.run(toolArguments);
    return { content: [{ type: "text", text: typeof result === "string" ? result : JSON.stringify(result, null, 2) }], isError: false };
  } catch (error) {
    const message = error instanceof McpToolError ? error.message : `the tool failed: ${error instanceof Error ? error.message : String(error)}`;
    return { content: [{ type: "text", text: message }], isError: true };
  }
}

function failure(status: number, id: unknown, code: number, message: string, data?: JsonObject): McpHttpResponse {
  return { status, body: JSON.stringify({ jsonrpc: "2.0", id, error: { code, message, ...(data ? { data } : {}) } }) };
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
