// アプリの origin を CORS で許していないバケットを、試験用の S3（integration/s3-up.sh）に用意する。
// アプリが同期先への要求をアプリの側（Rust）から送っていることを確かめる道具（Linux・Android）が使う。

import { AwsClient } from "aws4fetch";

export async function prepareBucketRefusingAppOrigin() {
  const remote = {
    endpoint: "http://127.0.0.1:18333", region: "us-east-1", bucket: "sedum-note-check-other-origin",
    prefix: `check-${Date.now()}`, accessKeyId: "SEDUMNOTETESTKEY", secretAccessKey: "sedumnotetestsecret",
  };
  const s3 = new AwsClient({ accessKeyId: remote.accessKeyId, secretAccessKey: remote.secretAccessKey, service: "s3", region: remote.region, retries: 0 });
  const bucketUrl = `${remote.endpoint}/${remote.bucket}`;
  await s3.fetch(bucketUrl, { method: "PUT" });
  // ほかの origin だけを許す CORS の規則。ブラウザからは断られる（e2e/corsRule.spec.ts と同じ形）。
  const corsForOtherOrigin = `<CORSConfiguration><CORSRule><AllowedOrigin>https://other.example</AllowedOrigin><AllowedMethod>GET</AllowedMethod><AllowedMethod>PUT</AllowedMethod><AllowedHeader>*</AllowedHeader><ExposeHeader>ETag</ExposeHeader></CORSRule></CORSConfiguration>`;
  const corsPut = await s3.fetch(`${bucketUrl}?cors`, { method: "PUT", body: corsForOtherOrigin });
  if (!corsPut.ok) {
    throw new Error(`could not put the CORS rule: ${corsPut.status}`);
  }
  // アプリの origin からの事前の確認（preflight）は、断られる。
  const preflight = await fetch(`${bucketUrl}/${remote.prefix}/vault.json`, {
    method: "OPTIONS", headers: { Origin: "tauri://localhost", "Access-Control-Request-Method": "PUT", "Access-Control-Request-Headers": "authorization,if-none-match" },
  });
  console.log(`a browser at the app's origin would be refused: preflight ${preflight.status}, allow-origin=${preflight.headers.get("access-control-allow-origin")}`);

  // フォルダ（prefix）の中に置かれたキーを、フォルダからの相対で返す。
  async function listStoredKeys() {
    const listed = await (await s3.fetch(`${bucketUrl}?list-type=2&prefix=${remote.prefix}/`)).text();
    return [...listed.matchAll(/<Key>([^<]+)<\/Key>/g)].map((match) => match[1].slice(remote.prefix.length + 1));
  }
  return { remote, listStoredKeys };
}

// vault と、メモ 1 件以上が同期先に置かれているか。
export function hasVaultAndRecord(keys) {
  return keys.includes("vault.json") && keys.some((key) => key.startsWith("records/"));
}
