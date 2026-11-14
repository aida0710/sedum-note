// エディタの上のタブの並びと、開け閉めの決まり。画面の状態（useWorkspaceNavigation）が、これを呼んで次の状態を作る。
//   ピン留めしたタブは左に並べ、「ほかのタブを閉じる」「右のタブを閉じる」では閉じない。
//   閉じたタブは、新しいものから順に、閉じる前の位置へ開き直せる（アプリを閉じるまで覚える）。
//   左の列でメモを普通に押すと「仮のタブ」で開く。仮のタブは 1 つだけで、次に左の列で押したメモと中身を入れ替える
//  （VS Code・Obsidian の preview と同じ）。書く・ダブルクリック・ピン留め・並べ替えで普通のタブになる。

export type TabsState = {
  openTabs: string[];
  activeTab: string | null;
  pinnedTabs: string[];
  // 仮のタブ（openTabs の 1 つ）。無ければ null。ピン留めしたタブは仮のタブにしない。
  previewTab: string | null;
  // 閉じたタブ。最後に閉じたものが末尾。
  closedTabs: ClosedTab[];
};

// index は、開き直すときに入れる位置（閉じたときに、そのタブより左に残ったタブの数）。
type ClosedTab = { tabId: string; index: number };

// 開き直せるよう覚えておく、閉じたタブの数。
const MAX_CLOSED_TABS = 20;

export const NO_TABS: TabsState = { openTabs: [], activeTab: null, pinnedTabs: [], previewTab: null, closedTabs: [] };

// タブを選ぶ。開いていなければ、普通のタブとして右端に足す。開いていた仮のタブは、仮のタブのまま選ぶ
//（タブを押す・← → で移る・タブの一覧から選ぶ、はここを通る）。
export function openTabIn(state: TabsState, tabId: string): TabsState {
  return { ...state, openTabs: state.openTabs.includes(tabId) ? state.openTabs : [...state.openTabs, tabId], activeTab: tabId };
}

// 普通のタブとして開く。仮のタブで開いていたら、普通のタブにする（リンク・コマンドパレット・新しいメモ・中クリックから）。
export function openKeptTabIn(state: TabsState, tabId: string): TabsState {
  return keepPreviewTabIn(openTabIn(state, tabId), tabId);
}

// 仮のタブで開く（左の列でメモを普通に押したとき）。もう開いているタブは、そのまま選ぶ。
// 仮のタブがあれば、その位置で中身を入れ替え、無ければ右端に仮のタブを足す。
export function openPreviewTabIn(state: TabsState, tabId: string): TabsState {
  if (state.openTabs.includes(tabId)) {
    return { ...state, activeTab: tabId };
  }
  const previewIndex = state.previewTab === null ? -1 : state.openTabs.indexOf(state.previewTab);
  const openTabs = previewIndex === -1 ? [...state.openTabs, tabId] : state.openTabs.with(previewIndex, tabId);
  return { ...state, openTabs, activeTab: tabId, previewTab: tabId };
}

// 仮のタブを普通のタブにする。tabId が仮のタブでなければ、何も変えない。
export function keepPreviewTabIn(state: TabsState, tabId: string): TabsState {
  return state.previewTab === tabId ? { ...state, previewTab: null } : state;
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
    previewTab: state.previewTab !== null && closing.has(state.previewTab) ? null : state.previewTab,
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
export type RememberedTabs = Pick<TabsState, "openTabs" | "pinnedTabs" | "activeTab" | "previewTab">;

// 残した並びを先に置き、戻すまでの間に開いたタブ（共有から開いたメモなど）はその右に足して、開いたままにする。
// tabExists が false を返すタブ（消えたメモ、消えたノートブックのデータベース表示）は捨てる。
export function restoreTabsIn(state: TabsState, remembered: RememberedTabs, tabExists: (tabId: string) => boolean): TabsState {
  const rememberedTabs = remembered.openTabs.filter(tabExists);
  const pinnedTabs = remembered.pinnedTabs.filter((tabId) => rememberedTabs.includes(tabId));
  const openedMeanwhile = state.openTabs.filter((tabId) => !rememberedTabs.includes(tabId));
  const unpinned = [...rememberedTabs.filter((tabId) => !pinnedTabs.includes(tabId)), ...openedMeanwhile];
  const openTabs = [...pinnedTabs, ...unpinned];
  // 選んでいたタブが消えていたら、残ったタブの最後を選ぶ（タブがあるのに、何も選んでいない画面にしない）。
  const rememberedActiveTab = remembered.activeTab !== null && rememberedTabs.includes(remembered.activeTab) ? remembered.activeTab : openTabs.at(-1) ?? null;
  // 仮のタブは 1 つだけなので、戻すまでの間に仮のタブを開いていたら、残した方を普通のタブにする。
  const rememberedPreviewTab = unpinned.find((tabId) => tabId === remembered.previewTab) ?? null;
  return { ...state, openTabs, pinnedTabs, activeTab: state.activeTab ?? rememberedActiveTab, previewTab: state.previewTab ?? rememberedPreviewTab };
}

// ピン留めを付け外しする。ピン留めしたタブは左のピン留めの並びの末尾へ、外したタブはピン留めの並びのすぐ右へ動かす。
export function togglePinnedTabIn(state: TabsState, tabId: string): TabsState {
  if (!state.openTabs.includes(tabId)) {
    return state;
  }
  const pinnedTabs = state.pinnedTabs.includes(tabId) ? state.pinnedTabs.filter((candidate) => candidate !== tabId) : [...state.pinnedTabs, tabId];
  const unpinned = state.openTabs.filter((candidate) => !pinnedTabs.includes(candidate));
  return { ...keepPreviewTabIn(state, tabId), pinnedTabs, openTabs: [...pinnedTabs, ...unpinned] };
}

// ドラッグでの並べ替え。ピン留めの並びとそれ以外の並びをまたいでは動かさない。動かした仮のタブは、普通のタブにする。
export function moveTabIn(state: TabsState, tabId: string, toTabId: string): TabsState {
  const from = state.openTabs.indexOf(tabId);
  const to = state.openTabs.indexOf(toTabId);
  if (from === -1 || to === -1 || from === to || state.pinnedTabs.includes(tabId) !== state.pinnedTabs.includes(toTabId)) {
    return state;
  }
  const reordered = state.openTabs.filter((candidate) => candidate !== tabId);
  reordered.splice(to, 0, tabId);
  return { ...keepPreviewTabIn(state, tabId), openTabs: reordered };
}
