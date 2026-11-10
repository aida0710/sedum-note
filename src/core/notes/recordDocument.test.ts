import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { encodeRecordState, readField, recordDocumentFromState, writeField } from "./recordDocument";

function mergeBothWays(left: Y.Doc, right: Y.Doc): void {
  Y.applyUpdate(left, encodeRecordState(right));
  Y.applyUpdate(right, encodeRecordState(left));
}

describe("recordDocument の項目", () => {
  it("2 台が同じ項目を書いたら、デバイスの ID の大小に関係なく、あとに書いた方が残る", () => {
    for (const [earlier, later] of [["device-a", "device-z"], ["device-z", "device-a"]] as const) {
      const first = new Y.Doc();
      const second = new Y.Doc();
      writeField(first, "title", "先に書いた", { deviceId: earlier, now: new Date("2026-11-11T00:00:00Z") });
      writeField(second, "title", "あとに書いた", { deviceId: later, now: new Date("2026-11-11T00:00:05Z") });
      mergeBothWays(first, second);
      expect(readField(first, "title")).toBe("あとに書いた");
      expect(readField(second, "title")).toBe("あとに書いた");
    }
  });

  it("時計が遅れているデバイスでも、見えている値を書き換えたら、その書き換えが残る", () => {
    const doc = new Y.Doc();
    writeField(doc, "title", "進んだ時計", { deviceId: "fast", now: new Date("2026-11-11T09:00:00Z") });
    writeField(doc, "title", "遅れた時計で直した", { deviceId: "slow", now: new Date("2026-11-11T08:00:00Z") });
    expect(readField(doc, "title")).toBe("遅れた時計で直した");
  });

  it("状態を書き出して読み直しても、項目が同じ値で読める", () => {
    const doc = new Y.Doc();
    writeField(doc, "pinned", true, { deviceId: "d", now: new Date() });
    expect(readField(recordDocumentFromState(encodeRecordState(doc)), "pinned")).toBe(true);
  });
});
