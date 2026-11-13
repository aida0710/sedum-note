import { describe, expect, it } from "vitest";
import { describeError, describeErrorReason } from "./describeError";
import { translate } from "./translate";

describe("describeError", () => {
  it("中身の分からない失敗は、もう一度試すよう言い、元のメッセージは後ろの括弧に下げる", () => {
    expect(describeError(new Error("disk is busy"))).toBe(translate("error.unknown", { detail: "disk is busy" }));
  });

  it("ほかの文の理由に入れるときは、「処理に失敗しました」を重ねず、元のメッセージだけにする", () => {
    expect(describeErrorReason(new Error("disk is busy"))).toBe("disk is busy");
  });

  it("通信できなかった fetch と、保存の容量の不足は、言葉にして出す", () => {
    for (const message of ["Failed to fetch", "NetworkError when attempting to fetch resource.", "Load failed"]) {
      expect(describeError(new TypeError(message))).toBe(translate("error.network"));
      expect(describeErrorReason(new TypeError(message))).toBe(translate("error.network"));
    }
    expect(describeError(new DOMException("The quota has been exceeded.", "QuotaExceededError"))).toBe(translate("error.quotaExceeded"));
  });
});
