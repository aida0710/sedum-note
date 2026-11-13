// ロックを解除している間、設定で有効にしてあれば MCP の窓口を開く。ロックすると（この hook が外れると）閉じる。

import { useCallback, useEffect, useRef, useState } from "react";
import { handleMcpRequest, type McpHttpRequest, type McpHttpResponse, type McpServerDefinition } from "../../core/mcp/mcpServer";
import { type McpSettings, readMcpSettings, writeMcpSettings } from "../../core/vault/mcpSettings";
import type { UnlockedVault } from "../../core/vault/vaultSession";
import { describeError } from "../i18n/describeError";
import { setMcpGatewayToken, startMcpGateway } from "../platform/mcpGateway";
import { APP_VERSION } from "../update/appVersion";
import { createMcpNoteTools, NOTE_SERVER_INSTRUCTIONS } from "./mcpNoteTools";

export type McpGatewayControl = {
  // 読み込むまでは null。
  settings: McpSettings | null;
  // 開けなかった理由（ポートが使われている、など）。
  errorMessage: string | null;
  saveSettings: (settings: McpSettings) => Promise<void>;
};

export function useMcpGateway(vault: UnlockedVault): McpGatewayControl {
  const [settings, setSettings] = useState<McpSettings | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const { repository, masterKey, localStore } = vault;

  useEffect(() => {
    void readMcpSettings(localStore, masterKey).then(setSettings);
  }, [localStore, masterKey]);

  // 窓口に答えるサーバーの中身（ツールの一覧）。設定やリポジトリが変わっても、窓口は開き直さずに中身だけ入れ替える
  // （開き直すと、クライアントがつないだままの接続に応答が返らなくなる）。
  const server = useRef<McpServerDefinition | null>(null);
  server.current = settings === null ? null : {
    name: "sedum-note",
    version: APP_VERSION,
    instructions: NOTE_SERVER_INSTRUCTIONS,
    tools: createMcpNoteTools(repository, { allowPermanentDelete: settings.allowPermanentDelete }),
  };
  const enabled = settings?.enabled ?? false;
  const token = settings?.token ?? "";
  const tokenRef = useRef(token);
  tokenRef.current = token;

  // 有効な間だけ、窓口を開く。
  useEffect(() => {
    if (!enabled) {
      return;
    }
    let stop: (() => Promise<void>) | null = null;
    let cancelled = false;
    setErrorMessage(null);
    const answer = async (request: McpHttpRequest): Promise<McpHttpResponse> =>
      server.current === null ? { status: 503, body: "" } : handleMcpRequest(request, server.current);
    startMcpGateway(tokenRef.current, answer).then(
      (started) => {
        if (cancelled) {
          void started();
        } else {
          stop = started;
        }
      },
      (error: unknown) => setErrorMessage(describeError(error)),
    );
    return () => {
      cancelled = true;
      void stop?.();
    };
  }, [enabled]);

  // トークンを作り直したら、開いている窓口に伝える。
  useEffect(() => {
    if (enabled) {
      void setMcpGatewayToken(token);
    }
  }, [enabled, token]);

  const saveSettings = useCallback(async (next: McpSettings) => {
    await writeMcpSettings(localStore, masterKey, next);
    setSettings(next);
  }, [localStore, masterKey]);

  return { settings, errorMessage, saveSettings };
}
