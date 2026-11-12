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

// 使うときにだけ読み込む依存（数式、図、PDF のプレビュー、アプリ内の AI）。
const LAZILY_LOADED_DEPENDENCIES = ["katex", "mermaid", "pdfjs-dist", "@anthropic-ai/sdk"];

export default defineConfig(({ command }) => ({
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(appVersion), __INCLUDES_MCP__: JSON.stringify(includesMcp(command)) },
  // 開発サーバー向け。使うときにだけ読み込む依存は、最初に使われた時点で見つかって作り直しになり、開いている画面が読み込み直される
  // （画面の試験が途中で止まる）。先に名前を挙げて、起動のときに用意させる。
  optimizeDeps: { include: LAZILY_LOADED_DEPENDENCIES },
  // 起動してすぐ、最初の画面のファイルを変換しておく（画面の試験が一斉に最初の画面を開いても、時間切れにならないように）。
  server: { warmup: { clientFiles: ["./src/main.tsx"] } },
  test: { include: ["src/**/*.test.ts"] },
}));
