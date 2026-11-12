// 同期先（S3 互換ストレージか WebDAV のサーバー）への要求の送り方。
//
// アプリ（Tauri）では、WebView でなくアプリの側（Rust）から送る。WebView から送るとブラウザと同じ扱いになり、
// バケットに CORS の設定が無いと全部断られる。アプリの側から送れば、バケットとキーを作るだけでつながる。
// Web 版はブラウザなので、fetch で送る（バケットに CORS の設定が要る）。

import { fetch as fetchFromApp } from "@tauri-apps/plugin-http";
import type { StorageRequestSender } from "../../core/remote/objectStore";
import { isRunningInTauri } from "./runtime";

export function storageRequestSender(): StorageRequestSender {
  return isRunningInTauri() ? (request) => fetchFromApp(request) : (request) => fetch(request);
}
