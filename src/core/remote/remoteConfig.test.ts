import { describe, expect, it } from "vitest";
import { findRemoteConfigProblem, type RemoteConfig } from "./remoteConfig";

const valid: RemoteConfig = {
  endpoint: "https://s3.example.com", bucket: "my-notes", region: "auto", prefix: "memo", accessKeyId: "key", secretAccessKey: "secret",
};

describe("findRemoteConfigProblem", () => {
  it("https のエンドポイントとふつうのバケット名は通す", () => {
    expect(findRemoteConfigProblem(valid)).toBeNull();
  });

  it("このマシンの中だけなら http も通す", () => {
    expect(findRemoteConfigProblem({ ...valid, endpoint: "http://127.0.0.1:8333" })).toBeNull();
  });

  it("外のマシンへの http は断る", () => {
    expect(findRemoteConfigProblem({ ...valid, endpoint: "http://s3.example.com" })).toBe("endpoint_not_https");
  });

  it("エンドポイントにパスを含めたら断る", () => {
    expect(findRemoteConfigProblem({ ...valid, endpoint: "https://s3.example.com/bucket" })).toBe("endpoint_has_path");
  });

  it("上の階層へ抜ける prefix は断る", () => {
    expect(findRemoteConfigProblem({ ...valid, prefix: "memo/../other" })).toBe("prefix_invalid");
  });
});
