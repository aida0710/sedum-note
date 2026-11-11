import { readFileSync } from "node:fs";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// 画面に出すアプリのバージョン。package.json・Cargo.toml・tauri.conf.json で同じ値にしている。
const appVersion = (JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as { version: string }).version;

export default defineConfig({
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(appVersion) },
  test: { include: ["src/**/*.test.ts"] },
});
