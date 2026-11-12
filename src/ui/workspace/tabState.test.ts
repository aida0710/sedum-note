import { describe, expect, it } from "vitest";
import { closeTabsIn, moveTabIn, NO_TABS, openTabIn, otherTabsThan, reopenClosedTabIn, tabsRightOf, togglePinnedTabIn, type TabsState } from "./tabState";

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
    expect(reopened).toMatchObject({ openTabs: ["a", "c"], activeTab: "c", closedTabs: ["b"] });
    expect(reopenClosedTabIn(reopened)).toMatchObject({ openTabs: ["a", "c", "b"], activeTab: "b", closedTabs: [] });
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
});
