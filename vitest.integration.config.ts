import { defineConfig } from "vitest/config";

// 本物の S3 互換サーバーを相手にする試験。サーバーの起動は integration/README.md。
export default defineConfig({
  test: { include: ["integration/**/*.test.ts"], testTimeout: 60_000 },
});
