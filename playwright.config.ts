import { defineConfig, devices } from "@playwright/test";
import { DEV_SERVER_PORT, PAGE_ORIGIN } from "./e2e/devServer";

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
  // 鍵の導出（Argon2id、64 MiB）は、試験を並べて流すと 1 回に数秒かかる。既定の 5 秒では、
  // 作成やロック解除の直後の表示を待ち切れないことがある。
  expect: { timeout: 15_000 },
  projects,
  use: { baseURL: PAGE_ORIGIN, locale: "ja-JP" },
  webServer: { command: `npx vite --host 127.0.0.1 --port ${DEV_SERVER_PORT} --strictPort`, url: PAGE_ORIGIN, reuseExistingServer: true },
});
