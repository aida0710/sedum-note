// アプリの確認で同期先にする、試験用の WebDAV のサーバー（integration/webdav-up.sh の Apache、127.0.0.1:18480）。
// 流すたびに、別のフォルダを使う。

// 試験用のサーバーの、固定の認証情報（integration/webdav-up.sh と同じ）。
export const WEBDAV = { url: `http://127.0.0.1:18480/app-check-${Date.now()}`, username: "sedum-note-test", password: "sedum-note-test-password" };
const authorization = `Basic ${Buffer.from(`${WEBDAV.username}:${WEBDAV.password}`).toString("base64")}`;

// サーバーのフォルダの直下にあるものの数（フォルダ自身を除く）。フォルダが無ければ 0。
export async function countOnServer(folder) {
  const response = await fetch(`${WEBDAV.url}/${folder}`, { method: "PROPFIND", headers: { Depth: "1", Authorization: authorization } });
  return response.status === 207 ? ((await response.text()).match(/<D:response[\s>]/g)?.length ?? 1) - 1 : 0;
}
