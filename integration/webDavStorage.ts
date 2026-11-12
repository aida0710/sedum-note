// 統合試験の WebDAV サーバー（既定は integration/webdav-up.sh の Apache）へのつなぎ方。試験ごとに、別のフォルダを使う。

import { newRandomId } from "../src/core/crypto/randomId";
import type { WebDavRemoteConfig } from "../src/core/remote/remoteConfig";

const TEST_WEBDAV_URL = "http://127.0.0.1:18480";
// 試験用のサーバーの、固定の認証情報（webdav-up.sh と同じ）。
const TEST_WEBDAV_CREDENTIALS = { username: "sedum-note-test", password: "sedum-note-test-password" };

// ほかの WebDAV のサーバーを相手に流すときの接続先（integration/README.md）。
function externalWebDavTarget(): { url: string; username: string; password: string } | null {
  const { WEBDAV_TEST_URL, WEBDAV_TEST_USERNAME, WEBDAV_TEST_PASSWORD } = process.env;
  return WEBDAV_TEST_URL && WEBDAV_TEST_USERNAME && WEBDAV_TEST_PASSWORD
    ? { url: WEBDAV_TEST_URL.replace(/\/+$/, ""), username: WEBDAV_TEST_USERNAME, password: WEBDAV_TEST_PASSWORD }
    : null;
}

export function newTestWebDavConfig(): WebDavRemoteConfig {
  const { url, ...credentials } = externalWebDavTarget() ?? { url: TEST_WEBDAV_URL, ...TEST_WEBDAV_CREDENTIALS };
  return { kind: "webdav", url: `${url}/run-${newRandomId()}`, ...credentials };
}
