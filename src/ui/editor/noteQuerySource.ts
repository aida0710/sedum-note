// クエリのブロックが、メモの一覧とノートブックを引くための入口。画面（PC とスマホの組み方）が、今の一覧を渡す。

import { createContext } from "react";
import type { NoteSummary } from "../../core/notes/noteQueries";
import type { LiveNotebook } from "../../core/notes/noteRecords";

export type NoteQuerySource = { summaries: NoteSummary[]; notebooks: LiveNotebook[] };

export const NoteQuerySourceContext = createContext<NoteQuerySource>({ summaries: [], notebooks: [] });
