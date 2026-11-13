// エディタの上のタブの並びと、開け閉めの決まり。画面の状態（useWorkspaceNavigation）が、これを呼んで次の状態を作る。
//   ピン留めしたタブは左に並べ、「ほかのタブを閉じる」「右のタブを閉じる」では閉じない。
//   閉じたタブは、新しいものから順に、閉じる前の位置へ開き直せる（アプリを閉じるまで覚える）。

export type TabsState = {
  openTabs: string[];
  activeTab: string | null;
  pinnedTabs: string[];
  // 閉じたタブ。最後に閉じたものが末尾。
  closedTabs: ClosedTab[];
};

// index は、開き直すときに入れる位置（閉じたときに、そのタブより左に残ったタブの数）。
type ClosedTab = { tabId: string; index: number };

// 開き直せるよう覚えておく、閉じたタブの数。
const MAX_CLOSED_TABS = 20;

export const NO_TABS: TabsState = { openTabs: [], activeTab: null, pinnedTabs: [], closedTabs: [] };

export function openTabIn(state: TabsState, tabId: string): TabsState {
  return { ...state, openTabs: state.openTabs.includes(tabId) ? state.openTabs : [...state.openTabs, tabId], activeTab: tabId };
}

// タブを閉じる。開いているタブを閉じたら、閉じた所の右（無ければ左）のタブを開く。
export function closeTabsIn(state: TabsState, tabIds: string[]): TabsState {
  const closing = new Set(tabIds.filter((tabId) => state.openTabs.includes(tabId)));
  if (closing.size === 0) {
    return state;
  }
  const remaining = state.openTabs.filter((tabId) => !closing.has(tabId));
  // まとめて閉じたタブは、末尾のものから開き直すので、どれも「左に残ったタブの数」の位置へ入れれば元の並びに戻る。
  const closed: ClosedTab[] = [...closing].map((tabId) => ({ tabId, index: state.openTabs.slice(0, state.openTabs.indexOf(tabId)).filter((left) => !closing.has(left)).length }));
  let activeTab = state.activeTab;
  if (activeTab !== null && closing.has(activeTab)) {
    const index = state.openTabs.indexOf(activeTab);
    activeTab = state.openTabs.slice(index + 1).find((tabId) => !closing.has(tabId))
      ?? state.openTabs.slice(0, index).reverse().find((tabId) => !closing.has(tabId))
      ?? null;
  }
  return {
    openTabs: remaining,
    activeTab,
    pinnedTabs: state.pinnedTabs.filter((tabId) => !closing.has(tabId)),
    closedTabs: [...state.closedTabs.filter(({ tabId }) => !closing.has(tabId)), ...closed].slice(-MAX_CLOSED_TABS),
  };
}

export function otherTabsThan(state: TabsState, tabId: string): string[] {
  return state.openTabs.filter((candidate) => candidate !== tabId && !state.pinnedTabs.includes(candidate));
}

export function tabsRightOf(state: TabsState, tabId: string): string[] {
  return state.openTabs.slice(state.openTabs.indexOf(tabId) + 1).filter((candidate) => !state.pinnedTabs.includes(candidate));
}

// いちばん最近に閉じたタブを、閉じる前の位置へ開き直す。閉じたあとでもう開いていれば、そのタブを選ぶだけにする。
// ピン留めは閉じたときに外れているので、ピン留めの並びより左へは入れない。
export function reopenClosedTabIn(state: TabsState): TabsState {
  const closed = state.closedTabs.at(-1);
  if (closed === undefined) {
    return state;
  }
  const closedTabs = state.closedTabs.slice(0, -1);
  if (state.openTabs.includes(closed.tabId)) {
    return { ...state, activeTab: closed.tabId, closedTabs };
  }
  const index = Math.min(Math.max(closed.index, state.pinnedTabs.length), state.openTabs.length);
  return { ...state, openTabs: [...state.openTabs.slice(0, index), closed.tabId, ...state.openTabs.slice(index)], activeTab: closed.tabId, closedTabs };
}

// 前に開いていたタブ（手元に残した並び）を、今の並びへ戻す。
export type RememberedTabs = Pick<TabsState, "openTabs" | "pinnedTabs" | "activeTab">;

// 残した並びを先に置き、戻すまでの間に開いたタブ（共有から開いたメモなど）はその右に足して、開いたままにする。
// tabExists が false を返すタブ（消えたメモ、消えたノートブックのデータベース表示）は捨てる。
export function restoreTabsIn(state: TabsState, remembered: RememberedTabs, tabExists: (tabId: string) => boolean): TabsState {
  const rememberedTabs = remembered.openTabs.filter(tabExists);
  const pinnedTabs = remembered.pinnedTabs.filter((tabId) => rememberedTabs.includes(tabId));
  const openedMeanwhile = state.openTabs.filter((tabId) => !rememberedTabs.includes(tabId));
  const unpinned = [...rememberedTabs.filter((tabId) => !pinnedTabs.includes(tabId)), ...openedMeanwhile];
  const rememberedActiveTab = remembered.activeTab !== null && rememberedTabs.includes(remembered.activeTab) ? remembered.activeTab : null;
  return { ...state, openTabs: [...pinnedTabs, ...unpinned], pinnedTabs, activeTab: state.activeTab ?? rememberedActiveTab };
}

// ピン留めを付け外しする。ピン留めしたタブは左のピン留めの並びの末尾へ、外したタブはピン留めの並びのすぐ右へ動かす。
export function togglePinnedTabIn(state: TabsState, tabId: string): TabsState {
  if (!state.openTabs.includes(tabId)) {
    return state;
  }
  const pinnedTabs = state.pinnedTabs.includes(tabId) ? state.pinnedTabs.filter((candidate) => candidate !== tabId) : [...state.pinnedTabs, tabId];
  const unpinned = state.openTabs.filter((candidate) => !pinnedTabs.includes(candidate));
  return { ...state, pinnedTabs, openTabs: [...pinnedTabs, ...unpinned] };
}

// ドラッグでの並べ替え。ピン留めの並びとそれ以外の並びをまたいでは動かさない。
export function moveTabIn(state: TabsState, tabId: string, toTabId: string): TabsState {
  const from = state.openTabs.indexOf(tabId);
  const to = state.openTabs.indexOf(toTabId);
  if (from === -1 || to === -1 || from === to || state.pinnedTabs.includes(tabId) !== state.pinnedTabs.includes(toTabId)) {
    return state;
  }
  const reordered = state.openTabs.filter((candidate) => candidate !== tabId);
  reordered.splice(to, 0, tabId);
  return { ...state, openTabs: reordered };
}
