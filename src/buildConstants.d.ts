// ビルドのときに値が入る定数（vite.config.ts の define）。

// package.json のバージョン。
declare const __APP_VERSION__: string;
// PC 版（Windows・macOS・Linux のアプリ）のビルドだけ true。Web 版と Android のアプリには MCP を同梱しない。
// 使う所では、この名前をそのまま条件に書く（別の変数に入れると、ビルドが使わないコードを取り除けない）。
declare const __INCLUDES_MCP__: boolean;
