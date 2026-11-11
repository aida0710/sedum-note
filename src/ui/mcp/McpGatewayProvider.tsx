// PC 版（デスクトップのアプリ）にだけ同梱する、MCP の入口。ロックを解除している間の窓口の開け閉めと、
// 設定の画面の MCP の欄を受け持つ。Web 版と Android のアプリは、このファイルから先を読み込まない（App.tsx）。

import type { ReactNode } from "react";
import type { UnlockedVault } from "../../core/vault/vaultSession";
import { McpSectionSlot } from "../settings/mcpSectionSlot";
import { McpSection } from "./McpSection";
import { useMcpGateway } from "./useMcpGateway";

export default function McpGatewayProvider({ vault, children }: { vault: UnlockedVault; children: ReactNode }) {
  const gateway = useMcpGateway(vault);
  return <McpSectionSlot.Provider value={<McpSection gateway={gateway} />}>{children}</McpSectionSlot.Provider>;
}
