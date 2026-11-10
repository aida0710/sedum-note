// 試験用の SeaweedFS（integration/s3-up.sh）の接続先と、試験ごとの新しいバケット。

import { AwsClient } from "aws4fetch";
import { newRandomId } from "../src/core/crypto/randomId";
import type { RemoteConfig } from "../src/core/remote/remoteConfig";

export const TEST_ENDPOINT = "http://127.0.0.1:18333";
const TEST_CREDENTIALS = { accessKeyId: "MEMOAPPTESTKEY", secretAccessKey: "memoapptestsecret" };

export async function newTestBucket(): Promise<RemoteConfig> {
  const bucket = `memo-test-${newRandomId().slice(0, 12)}`;
  const client = new AwsClient({ ...TEST_CREDENTIALS, service: "s3", region: "us-east-1", retries: 0 });
  const response = await client.fetch(`${TEST_ENDPOINT}/${bucket}`, { method: "PUT" });
  if (!response.ok) {
    throw new Error(`could not create the test bucket: ${response.status} ${await response.text()}`);
  }
  return { endpoint: TEST_ENDPOINT, bucket, region: "us-east-1", prefix: "memo", ...TEST_CREDENTIALS };
}
