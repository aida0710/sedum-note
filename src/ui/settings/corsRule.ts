// バケットに入れてもらう CORS の設定。このアプリの画面の origin（Tauri の WebView と
// Web 版）から、条件付き PUT と ETag の読み取りができるようにする。DELETE は、
// つなぐときに条件付き書き込みを確かめた試しのオブジェクトを消すのに使う。

// Tauri の WebView の origin。Windows と Android は http://tauri.localhost、macOS と Linux は tauri://localhost。
const TAURI_ORIGINS = ["http://tauri.localhost", "tauri://localhost"];

export function corsRuleJson(currentOrigin: string): string {
  const origins = [...new Set([...TAURI_ORIGINS, currentOrigin])];
  return JSON.stringify([{
    AllowedOrigins: origins,
    AllowedMethods: ["GET", "PUT", "HEAD", "DELETE"],
    AllowedHeaders: ["*"],
    ExposeHeaders: ["ETag"],
    MaxAgeSeconds: 3600,
  }], null, 2);
}
