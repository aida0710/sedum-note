import { describe, expect, it } from "vitest";
import { MAX_VERSIONS_PER_NOTE, VERSION_RETENTION_DAYS, versionsToRemove } from "./versionRetention";

const NOW = new Date("2026-11-12T00:00:00Z");
const DAY = 24 * 60 * 60 * 1000;
const capturedDaysAgo = (days: number) => ({ capturedAtMilliseconds: NOW.getTime() - days * DAY });

describe("versionsToRemove", () => {
  it("新しい方から決めた数までを残し、それより古いものを消す", () => {
    const versions = Array.from({ length: MAX_VERSIONS_PER_NOTE + 2 }, (_, index) => ({ capturedAtMilliseconds: NOW.getTime() - index * 1000 }));
    expect(versionsToRemove(versions, NOW)).toEqual(versions.slice(MAX_VERSIONS_PER_NOTE));
  });

  it("数が少なくても、決めた日数より前に残したものは消す", () => {
    const recent = capturedDaysAgo(VERSION_RETENTION_DAYS - 1);
    const old = capturedDaysAgo(VERSION_RETENTION_DAYS + 1);
    expect(versionsToRemove([old, recent], NOW)).toEqual([old]);
  });
});
