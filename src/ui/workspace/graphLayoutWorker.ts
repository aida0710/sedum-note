// グラフ表示の点の置き方を計算する、別のスレッド（ワーカー）の入口。計算は点の数の 2 乗に比例し、メモが 2,000 件あると
// 数秒かかるので、画面を止めないよう、ここで計算する。

import { type GraphPoint, layoutNoteGraph, type NoteGraph } from "../../core/notes/noteGraph";

export type GraphLayoutRequest = NoteGraph;
// メモの ID と位置の組（Map はそのまま送れないので、組の並びにする）。
export type GraphLayoutResponse = Array<[string, GraphPoint]>;

self.onmessage = (event: MessageEvent<GraphLayoutRequest>) => {
  self.postMessage([...layoutNoteGraph(event.data)] satisfies GraphLayoutResponse);
};
