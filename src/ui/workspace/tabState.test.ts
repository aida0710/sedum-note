import { describe, expect, it } from "vitest";
import { closeTabsIn, moveTabIn, NO_TABS, openTabIn, otherTabsThan, reopenClosedTabIn, restoreTabsIn, tabsRightOf, togglePinnedTabIn, type TabsState } from "./tabState";

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
    const remembered = { openTabs: ["pinned", "gone", "b"], pinnedTabs: ["pinned", "gone"], activeTab: "b" };
    expect(restoreTabsIn(NO_TABS, remembered, (tabId) => tabId !== "gone")).toMatchObject({ openTabs: ["pinned", "b"], pinnedTabs: ["pinned"], activeTab: "b" });
    expect(restoreTabsIn(NO_TABS, { ...remembered, activeTab: "gone" }, (tabId) => tabId !== "gone").activeTab).toBeNull();
  });

  it("残した並びを戻すまでの間に開いたタブは、右に足して開いたままにする", () => {
    const remembered = { openTabs: ["a", "b"], pinnedTabs: ["a"], activeTab: "a" };
    expect(restoreTabsIn(tabsOf("shared"), remembered, () => true)).toMatchObject({ openTabs: ["a", "b", "shared"], pinnedTabs: ["a"], activeTab: "shared" });
  });
});
