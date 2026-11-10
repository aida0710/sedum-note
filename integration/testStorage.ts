// 試験用の SeaweedFS（integration/s3-up.sh）の接続先と、試験ごとの新しい置き場所。
//
// バケットは 1 つを使い回し、試験ごとに prefix を分ける。SeaweedFS はバケットごとに
// ボリュームを割り当てるので、試験ごとにバケットを作ると数十回でボリュームを使い切る。

import { AwsClient } from "aws4fetch";
import { newRandomId } from "../src/core/crypto/randomId";
import type { RemoteConfig } from "../src/core/remote/remoteConfig";

export const TEST_ENDPOINT = "http://127.0.0.1:18333";
const TEST_CREDENTIALS = { accessKeyId: "MEMOAPPTESTKEY", secretAccessKey: "memoapptestsecret" };

const TEST_BUCKET = "memo-test";

export async function newTestRemoteConfig(): Promise<RemoteConfig> {
  const client = new AwsClient({ ...TEST_CREDENTIALS, service: "s3", region: "us-east-1", retries: 0 });
  const response = await client.fetch(`${TEST_ENDPOINT}/${TEST_BUCKET}`, { method: "PUT" });
  // 2 回目からは「既にある」（409）が返る。
  if (!response.ok && response.status !== 409) {
    throw new Error(`could not create the test bucket: ${response.status} ${await response.text()}`);
  }
  return { endpoint: TEST_ENDPOINT, bucket: TEST_BUCKET, region: "us-east-1", prefix: `run-${newRandomId()}`, ...TEST_CREDENTIALS };
}
