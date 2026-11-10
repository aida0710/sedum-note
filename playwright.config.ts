import { defineConfig } from "@playwright/test";

// 画面の試験。S3 互換サーバー（integration/s3-up.sh）を先に起動しておく。
export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  use: { baseURL: "http://127.0.0.1:5173", locale: "ja-JP" },
  webServer: { command: "npx vite --host 127.0.0.1 --port 5173 --strictPort", url: "http://127.0.0.1:5173", reuseExistingServer: true },
});
