import { readFileSync } from "node:fs";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// 画面に出すアプリのバージョン。package.json・Cargo.toml・tauri.conf.json で同じ値にしている。
const appVersion = (JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as { version: string }).version;

// MCP は PC 版（デスクトップのアプリ）にだけ同梱する。Tauri は、ビルドの対象の OS を TAURI_ENV_PLATFORM で渡す
// （Android は "android"）。Web 版のビルド（Tauri を通さない）では、この変数が無い。
const DESKTOP_PLATFORMS = ["windows", "darwin", "linux"];

function includesMcp(command: "build" | "serve"): boolean {
  const platform = process.env.TAURI_ENV_PLATFORM;
  // Tauri を通さない開発サーバーと試験は、PC 版として動かす（画面の試験が PC 版と同じ画面を見るように）。
  return platform === undefined ? command === "serve" : DESKTOP_PLATFORMS.includes(platform);
}

export default defineConfig(({ command }) => ({
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(appVersion), __INCLUDES_MCP__: JSON.stringify(includesMcp(command)) },
  test: { include: ["src/**/*.test.ts"] },
}));
