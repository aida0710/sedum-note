import { describe, expect, it } from "vitest";
import {
  closeTabsIn, keepPreviewTabIn, moveTabIn, NO_TABS, openKeptTabIn, openPreviewTabIn, openTabIn, otherTabsThan, reopenClosedTabIn, restoreTabsIn, tabsRightOf,
  togglePinnedTabIn, type TabsState,
} from "./tabState";

function tabsOf(...tabIds: string[]): TabsState {
  return tabIds.reduce(openTabIn, NO_TABS);
}

describe("タブの開け閉め", () => {
  it("開いているタブを閉じると、右のタブ（無ければ左）が開く", () => {
    const tabs = openTabIn(tabsOf("a", "b", "c"), "b");
    expect(closeTabsIn(tabs, ["b"])).toMatchObject({ openTabs: ["a", "c"], activeTab: "c" });
    expect(closeTabsIn(openTabIn(tabs, "c"), ["c"])).toMatchObject({ openTabs: ["a", "b"], activeTab: "b" });
  });

  it("ほかのタブと右のタブは、ピン留めしたタブを含まない", () => {
    const tabs = togglePinnedTabIn(tabsOf("a", "b", "c", "d"), "c");
    expect(tabs.openTabs).toEqual(["c", "a", "b", "d"]);
    expect(otherTabsThan(tabs, "b")).toEqual(["a", "d"]);
    expect(tabsRightOf(tabs, "a")).toEqual(["b", "d"]);
  });

  it("閉じたタブは、最後に閉じたものから順に開き直せる", () => {
    const closed = closeTabsIn(closeTabsIn(tabsOf("a", "b", "c"), ["b"]), ["c"]);
    const reopened = reopenClosedTabIn(closed);
    expect(reopened).toMatchObject({ openTabs: ["a", "c"], activeTab: "c" });
    expect(reopenClosedTabIn(reopened)).toMatchObject({ openTabs: ["a", "b", "c"], activeTab: "b", closedTabs: [] });
  });

  it("閉じたタブを開き直すと、閉じる前の位置へ戻る。まとめて閉じたタブも、順に開き直すと元の並びになる", () => {
    const tabs = tabsOf("a", "b", "c", "d");
    expect(reopenClosedTabIn(closeTabsIn(tabs, ["b"])).openTabs).toEqual(["a", "b", "c", "d"]);
    const othersClosed = closeTabsIn(tabs, ["a", "b", "d"]);
    expect(reopenClosedTabIn(reopenClosedTabIn(reopenClosedTabIn(othersClosed))).openTabs).toEqual(["a", "b", "c", "d"]);
  });

  it("ピン留めのタブより左で閉じたタブは、開き直すとピン留めの並びのすぐ右に入る", () => {
    const closed = closeTabsIn(tabsOf("a", "b", "c"), ["a"]);
    const pinned = togglePinnedTabIn(togglePinnedTabIn(closed, "b"), "c");
    expect(reopenClosedTabIn(pinned).openTabs).toEqual(["b", "c", "a"]);
  });

  it("ピン留めを外したタブは、ピン留めの並びのすぐ右に来る", () => {
    const pinned = togglePinnedTabIn(togglePinnedTabIn(tabsOf("a", "b", "c"), "c"), "b");
    expect(pinned.openTabs).toEqual(["c", "b", "a"]);
    expect(togglePinnedTabIn(pinned, "c").openTabs).toEqual(["b", "c", "a"]);
  });

  it("ドラッグでは、ピン留めの並びとそれ以外の並びをまたいで動かさない", () => {
    const tabs = togglePinnedTabIn(tabsOf("a", "b", "c"), "a");
    expect(moveTabIn(tabs, "c", "a")).toBe(tabs);
    expect(moveTabIn(tabs, "c", "b").openTabs).toEqual(["a", "c", "b"]);
  });

  it("残した並びを戻すと、消えたメモのタブは捨て、ピン留めと選んでいたタブは戻る", () => {
    const remembered = { openTabs: ["pinned", "gone", "b"], pinnedTabs: ["pinned", "gone"], activeTab: "b", previewTab: null };
    expect(restoreTabsIn(NO_TABS, remembered, (tabId) => tabId !== "gone")).toMatchObject({ openTabs: ["pinned", "b"], pinnedTabs: ["pinned"], activeTab: "b" });
    // 選んでいたタブが消えていたら、残ったタブの最後を選ぶ。残ったタブが無ければ、何も選ばない。
    expect(restoreTabsIn(NO_TABS, { ...remembered, activeTab: "gone" }, (tabId) => tabId !== "gone").activeTab).toBe("b");
    expect(restoreTabsIn(NO_TABS, { ...remembered, activeTab: "gone" }, () => false)).toMatchObject({ openTabs: [], activeTab: null });
  });

  it("残した並びを戻すまでの間に開いたタブは、右に足して開いたままにする", () => {
    const remembered = { openTabs: ["a", "b"], pinnedTabs: ["a"], activeTab: "a", previewTab: null };
    expect(restoreTabsIn(tabsOf("shared"), remembered, () => true)).toMatchObject({ openTabs: ["a", "b", "shared"], pinnedTabs: ["a"], activeTab: "shared" });
  });
});

describe("仮のタブ", () => {
  it("仮のタブがあれば、次に仮で開いたメモと、その位置で入れ替わる。無ければ右端に足す", () => {
    const preview = openPreviewTabIn(tabsOf("a", "b"), "x");
    expect(preview).toMatchObject({ openTabs: ["a", "b", "x"], activeTab: "x", previewTab: "x" });
    const moved = moveTabIn(openTabIn(preview, "a"), "b", "a");
    expect(openPreviewTabIn(moved, "y")).toMatchObject({ openTabs: ["b", "a", "y"], activeTab: "y", previewTab: "y" });
    const inMiddle = { ...tabsOf("a", "x", "b"), previewTab: "x" };
    expect(openPreviewTabIn(inMiddle, "y")).toMatchObject({ openTabs: ["a", "y", "b"], previewTab: "y" });
  });

  it("もう開いているメモを仮で開くと、そのタブを選ぶだけで、仮のタブは入れ替えない", () => {
    const preview = openPreviewTabIn(tabsOf("a", "b"), "x");
    expect(openPreviewTabIn(preview, "a")).toMatchObject({ openTabs: ["a", "b", "x"], activeTab: "a", previewTab: "x" });
  });

  it("タブを選んだだけでは仮のタブのままで、普通に開く・ピン留め・並べ替えで普通のタブになる", () => {
    const preview = openPreviewTabIn(tabsOf("a"), "x");
    expect(openTabIn(openTabIn(preview, "a"), "x").previewTab).toBe("x");
    expect(openKeptTabIn(preview, "x")).toMatchObject({ openTabs: ["a", "x"], previewTab: null });
    expect(togglePinnedTabIn(preview, "x").previewTab).toBeNull();
    expect(moveTabIn(preview, "x", "a")).toMatchObject({ openTabs: ["x", "a"], previewTab: null });
    expect(keepPreviewTabIn(preview, "x").previewTab).toBeNull();
    // ほかのタブを動かしたり、ほかのタブを普通にしたりしても、仮のタブのまま。
    expect(keepPreviewTabIn(preview, "a").previewTab).toBe("x");
    expect(moveTabIn({ ...tabsOf("a", "b", "x"), previewTab: "x" }, "a", "b").previewTab).toBe("x");
  });

  it("仮のタブを閉じると、次に仮で開いたメモは右端に足し、開き直したタブは普通のタブになる", () => {
    const closed = closeTabsIn(openPreviewTabIn(tabsOf("a", "b"), "x"), ["x"]);
    expect(closed.previewTab).toBeNull();
    expect(reopenClosedTabIn(closed)).toMatchObject({ openTabs: ["a", "b", "x"], previewTab: null });
  });

  it("残した並びを戻すと仮のタブも戻る。戻すまでの間に仮のタブを開いていたら、そちらを仮のタブにする", () => {
    const remembered = { openTabs: ["a", "x"], pinnedTabs: [], activeTab: "x", previewTab: "x" };
    expect(restoreTabsIn(NO_TABS, remembered, () => true)).toMatchObject({ openTabs: ["a", "x"], previewTab: "x" });
    expect(restoreTabsIn(NO_TABS, remembered, (tabId) => tabId !== "x").previewTab).toBeNull();
    expect(restoreTabsIn(openPreviewTabIn(NO_TABS, "y"), remembered, () => true)).toMatchObject({ openTabs: ["a", "x", "y"], previewTab: "y" });
  });
});
