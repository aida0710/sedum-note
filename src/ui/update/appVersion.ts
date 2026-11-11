// このアプリのバージョン。ビルドのときに package.json の値が入る（vite.config.ts）。

declare const __APP_VERSION__: string;

export const APP_VERSION: string = __APP_VERSION__;
