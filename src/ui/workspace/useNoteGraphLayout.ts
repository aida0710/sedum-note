// グラフ表示の点の置き方を、別のスレッド（graphLayoutWorker.ts）で計算して受け取る。計算している間は null。
// つながりが変わって計算し直すときは、前の計算をワーカーごと止める（古い置き方が、あとから届いて上書きしないように）。

import { useEffect, useState } from "react";
import type { GraphPoint, NoteGraph } from "../../core/notes/noteGraph";
import type { GraphLayoutRequest, GraphLayoutResponse } from "./graphLayoutWorker";

export function useNoteGraphLayout(graph: NoteGraph): Map<string, GraphPoint> | null {
  const [layout, setLayout] = useState<{ graph: NoteGraph; points: Map<string, GraphPoint> } | null>(null);
  useEffect(() => {
    const worker = new Worker(new URL("./graphLayoutWorker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (event: MessageEvent<GraphLayoutResponse>) => {
      setLayout({ graph, points: new Map(event.data) });
      worker.terminate();
    };
    worker.postMessage(graph satisfies GraphLayoutRequest);
    return () => worker.terminate();
  }, [graph]);
  // 前のつながりの置き方は使わない（点が増えたり減ったりしていて、位置の無い点が出る）。
  return layout?.graph === graph ? layout.points : null;
}
