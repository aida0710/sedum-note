// 設定の画面の、MCP の欄を差し込む場所。MCP のコードは PC 版（デスクトップのアプリ）にだけ同梱するので、
// 設定の画面は MCP の欄を直接は読み込まない。PC 版では、mcp/McpGatewayProvider.tsx がここへ欄を入れる。

import { createContext, type ReactNode } from "react";

export const McpSectionSlot = createContext<ReactNode>(null);
