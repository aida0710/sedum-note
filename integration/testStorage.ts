// 試験用の SeaweedFS（integration/s3-up.sh）の接続先と、試験ごとの新しい置き場所。
//
// バケットは 1 つを使い回し、試験ごとに prefix を分ける。SeaweedFS はバケットごとに
// ボリュームを割り当てるので、試験ごとにバケットを作ると数十回でボリュームを使い切る。

import { AwsClient } from "aws4fetch";
import { newRandomId } from "../src/core/crypto/randomId";
import type { RemoteConfig } from "../src/core/remote/remoteConfig";

export const TEST_ENDPOINT = "http://127.0.0.1:18333";
const TEST_CREDENTIALS = { accessKeyId: "SEDUMNOTETESTKEY", secretAccessKey: "sedumnotetestsecret" };

const TEST_BUCKET = "sedum-note-test";

function testClient(): AwsClient {
  return new AwsClient({ ...TEST_CREDENTIALS, service: "s3", region: "us-east-1", retries: 0 });
}

async function ensureBucket(bucket: string): Promise<void> {
  const response = await testClient().fetch(`${TEST_ENDPOINT}/${bucket}`, { method: "PUT" });
  // 2 回目からは「既にある」（409）が返る。
  if (!response.ok && response.status !== 409) {
    throw new Error(`could not create the test bucket ${bucket}: ${response.status} ${await response.text()}`);
  }
}

// 実際のストレージ（Cloudflare R2、AWS S3 など）を相手に統合試験を流すときの接続先。環境変数
// R2_ENDPOINT・R2_BUCKET・R2_ACCESS_KEY_ID・R2_SECRET_ACCESS_KEY を渡すと、SeaweedFS の代わりにそこへつなぐ
// （リージョンは R2_REGION、無ければ auto）。試験は run-<乱数> のフォルダに書くので、終わったら消す
// （integration/README.md）。
function externalRemoteConfig(): Omit<RemoteConfig, "prefix"> | null {
  const { R2_ENDPOINT, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_REGION } = process.env;
  if (!R2_ENDPOINT || !R2_BUCKET || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
    return null;
  }
  return { endpoint: R2_ENDPOINT, bucket: R2_BUCKET, region: R2_REGION ?? "auto", accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY };
}

export const TEST_RUN_PREFIX = "run-";

export async function newTestRemoteConfig(): Promise<RemoteConfig> {
  const prefix = `${TEST_RUN_PREFIX}${newRandomId()}`;
  const external = externalRemoteConfig();
  if (external) {
    return { ...external, prefix };
  }
  await ensureBucket(TEST_BUCKET);
  return { endpoint: TEST_ENDPOINT, bucket: TEST_BUCKET, region: "us-east-1", prefix, ...TEST_CREDENTIALS };
}

// 設定画面が案内する形（S3 の JSON）の CORS の規則。
export type CorsRule = {
  AllowedOrigins: string[];
  AllowedMethods: string[];
  AllowedHeaders: string[];
  ExposeHeaders: string[];
  MaxAgeSeconds: number;
};

// CORS の規則を入れたバケットを使う。規則ごとにバケットを分ける（バケットの数は試験の種類の数だけ）。
export async function newTestRemoteConfigWithCors(bucket: string, rules: CorsRule[]): Promise<RemoteConfig> {
  await ensureBucket(bucket);
  const element = (name: string, values: string[]) => values.map((value) => `<${name}>${value}</${name}>`).join("");
  const body = `<CORSConfiguration>${rules.map((rule) => `<CORSRule>${element("AllowedOrigin", rule.AllowedOrigins)}${element("AllowedMethod", rule.AllowedMethods)}${element("AllowedHeader", rule.AllowedHeaders)}${element("ExposeHeader", rule.ExposeHeaders)}<MaxAgeSeconds>${rule.MaxAgeSeconds}</MaxAgeSeconds></CORSRule>`).join("")}</CORSConfiguration>`;
  // AWS は Content-MD5 を求めるが、SeaweedFS は求めない（試験はこちらだけ）。
  const response = await testClient().fetch(`${TEST_ENDPOINT}/${bucket}?cors`, { method: "PUT", headers: { "Content-Type": "application/xml" }, body });
  if (!response.ok) {
    throw new Error(`could not set CORS on ${bucket}: ${response.status} ${await response.text()}`);
  }
  return { endpoint: TEST_ENDPOINT, bucket, region: "us-east-1", prefix: `run-${newRandomId()}`, ...TEST_CREDENTIALS };
}
