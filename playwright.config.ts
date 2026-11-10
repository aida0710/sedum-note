import { defineConfig, devices } from "@playwright/test";

// 画面の試験。S3 互換サーバー（integration/s3-up.sh）を先に起動しておく。
// macOS のアプリは WebKit（WKWebView）で動くので、CI では WebKit でも流す。
// 手元に WebKit を入れていなければ E2E_WEBKIT を付けずに流す。
const projects = [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }];
if (process.env.E2E_WEBKIT) {
  projects.push({ name: "webkit", use: { ...devices["Desktop Safari"] } });
}

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  projects,
  use: { baseURL: "http://127.0.0.1:5173", locale: "ja-JP" },
  webServer: { command: "npx vite --host 127.0.0.1 --port 5173 --strictPort", url: "http://127.0.0.1:5173", reuseExistingServer: true },
});
