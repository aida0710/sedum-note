import { describe, expect, it } from "vitest";
import { compareVersions } from "./compareVersions";

describe("compareVersions", () => {
  it("数字の大きさで比べる（0.10.0 は 0.9.0 より新しい）", () => {
    expect(compareVersions("0.10.0", "0.9.0")).toBeGreaterThan(0);
    expect(compareVersions("0.1.0", "0.2.0")).toBeLessThan(0);
  });

  it("先頭の v と、桁の数の違いを気にしない", () => {
    expect(compareVersions("v1.2.0", "1.2")).toBe(0);
    expect(compareVersions("v1.2.1", "1.2")).toBeGreaterThan(0);
  });
});
