// ロックを解除している間、設定で有効にしてあれば MCP の窓口を開く。ロックすると（この hook が外れると）閉じる。

import { createContext, useCallback, useEffect, useState } from "react";
import { handleMcpRequest } from "../../core/mcp/mcpServer";
import { type McpSettings, readMcpSettings, writeMcpSettings } from "../../core/vault/mcpSettings";
import type { UnlockedVault } from "../../core/vault/vaultSession";
import { describeError } from "../i18n/describeError";
import { isMcpGatewayAvailable, startMcpGateway } from "../platform/mcpGateway";
import { APP_VERSION } from "../update/appVersion";
import { createNoteTools, NOTE_SERVER_INSTRUCTIONS } from "./noteTools";

export type McpGatewayControl = {
  // 読み込むまでは null。窓口の無い環境（Web 版、Android）でも null のまま。
  settings: McpSettings | null;
  // 開けなかった理由（ポートが使われている、など）。
  errorMessage: string | null;
  saveSettings: (settings: McpSettings) => Promise<void>;
};

// 設定の画面へ渡す。窓口の無い環境では、settings が null のまま。
export const McpGatewayContext = createContext<McpGatewayControl>({ settings: null, errorMessage: null, saveSettings: async () => undefined });

export function useMcpGateway(vault: UnlockedVault): McpGatewayControl {
  const [settings, setSettings] = useState<McpSettings | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const { repository, masterKey, localStore } = vault;

  useEffect(() => {
    if (isMcpGatewayAvailable()) {
      void readMcpSettings(localStore, masterKey).then(setSettings);
    }
  }, [localStore, masterKey]);

  useEffect(() => {
    if (!settings?.enabled) {
      return;
    }
    const server = {
      name: "sedum-note",
      version: APP_VERSION,
      instructions: NOTE_SERVER_INSTRUCTIONS,
      tools: createNoteTools(repository, { allowPermanentDelete: settings.allowPermanentDelete }),
    };
    let stop: (() => Promise<void>) | null = null;
    let cancelled = false;
    setErrorMessage(null);
    startMcpGateway(settings.token, (request) => handleMcpRequest(request, server)).then(
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
  }, [settings, repository]);

  const saveSettings = useCallback(async (next: McpSettings) => {
    await writeMcpSettings(localStore, masterKey, next);
    setSettings(next);
  }, [localStore, masterKey]);

  return { settings, errorMessage, saveSettings };
}
