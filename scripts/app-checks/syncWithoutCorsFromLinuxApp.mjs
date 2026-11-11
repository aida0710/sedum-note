// 組み立てた Linux のアプリが、CORS でアプリの origin を許していないバケットへ同期できるかを確かめる。
// アプリは同期先への要求をアプリの側（Rust）から送るので、バケットの CORS の設定に関わらずつながるはず。手で流す確認の道具。
//
// 前提: integration/s3-up.sh、scripts/app-checks/linux/build-app.sh のあと run-built-app-driver.sh。
// 使い方: node scripts/app-checks/syncWithoutCorsFromLinuxApp.mjs <画像を置くフォルダ>

import { writeFileSync } from "node:fs";
import { AwsClient } from "aws4fetch";
import { PASSPHRASE, REMOTE_FIELDS } from "./checkDevices.mjs";
import { WebDriverSession } from "./webDriverSession.mjs";

const outputDirectory = process.argv[2];
// ほかの origin だけを許す CORS の規則を入れたバケット。ブラウザからは断られる（e2e/corsRule.spec.ts と同じ形）。
const remote = {
  endpoint: "http://127.0.0.1:18333", region: "us-east-1", bucket: "sedum-note-check-other-origin",
  prefix: `check-${Date.now()}`, accessKeyId: "SEDUMNOTETESTKEY", secretAccessKey: "sedumnotetestsecret",
};
const s3 = new AwsClient({ accessKeyId: remote.accessKeyId, secretAccessKey: remote.secretAccessKey, service: "s3", region: remote.region, retries: 0 });
const bucketUrl = `${remote.endpoint}/${remote.bucket}`;
await s3.fetch(bucketUrl, { method: "PUT" });
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

const app = await WebDriverSession.start("http://127.0.0.1:14444", { browserName: "wry", "tauri:options": { application: "/app/sedum-note" } });
const execute = (script) => app.command("POST", "/execute/sync", { script, args: [] });
try {
  await app.waitForXPath("//input[@type='password']", 30_000);
  await execute(`localStorage.setItem("sedum-note:devicePreferences", JSON.stringify({ language: "ja", checkForUpdates: false })); location.reload();`);
  await new Promise((resolve) => setTimeout(resolve, 3_000));
  await app.type(await app.waitForXPath("//input[@id='setup-passphrase']", 30_000), PASSPHRASE);
  await app.type(await app.find("#setup-passphrase-confirm"), PASSPHRASE);
  await app.click(await app.findByXPath("//label[contains(., 'ほかのデバイスと同期する')]/input"));
  for (const [, inputId, field] of REMOTE_FIELDS) {
    const input = await app.waitForXPath(`//input[@id='${inputId}']`, 10_000);
    await app.command("POST", `/element/${input}/clear`, {});
    await app.type(input, remote[field]);
  }
  // アプリには、CORS の案内を出さない。
  const corsGuideShown = await execute(`return document.body.innerText.includes("バケットの CORS の設定")`);
  await app.click(await app.findByXPath("//button[normalize-space()='作成']"));
  await app.click(await app.waitForXPath("//button[normalize-space()='新しいメモ']", 60_000));
  await app.type(await app.waitForXPath("//input[@placeholder='タイトル']", 10_000), "CORS なしで同期したメモ");
  await app.waitForXPath("//button[contains(@class,'sync-line')][contains(., '同期済み')]", 30_000);
  writeFileSync(`${outputDirectory}/linux-sync-without-cors.png`, await app.screenshotPng());
  const listed = await (await s3.fetch(`${bucketUrl}?list-type=2&prefix=${remote.prefix}/`)).text();
  const keys = [...listed.matchAll(/<Key>([^<]+)<\/Key>/g)].map((match) => match[1].slice(remote.prefix.length + 1));
  if (!keys.includes("vault.json") || !keys.some((key) => key.startsWith("records/"))) {
    throw new Error(`the vault and the note were not written to the storage: ${keys.join(", ")}`);
  }
  console.log(`ok: the app synced to a bucket that does not allow its origin (${keys.length} objects; CORS guide shown in the app: ${corsGuideShown})`);
} finally {
  await app.end().catch(() => undefined);
}
