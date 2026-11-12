// 画面の試験が開く開発サーバーのアドレス。別の作業ツリーで同時に試験を流すときは、E2E_PORT で別のポートにする
// （同じポートだと、playwright.config.ts の reuseExistingServer で、相手のサーバーの画面を試験してしまう）。
// 試験用のバケットの CORS で許す origin も、これに合わせる。

export const DEV_SERVER_PORT = process.env.E2E_PORT ?? "5173";
export const PAGE_ORIGIN = `http://127.0.0.1:${DEV_SERVER_PORT}`;
