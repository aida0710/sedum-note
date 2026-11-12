// メモをドラッグするときに、ブラウザのドラッグのデータ（dataTransfer）に入れる中身。
// 左の列の一覧（ノートブックへ移す）と、本文（リンクを入れる）の両方が読む。
// 左の列で複数のメモを選んでいれば、選んだメモをまとめて運ぶ。

// ドラッグのデータの種類。ほかのアプリやファイルのドラッグと区別する。
const NOTE_DRAG_TYPE = "application/x-sedum-note";

export type DraggedNotes = {
  noteIds: string[];
  // ドラッグを始めた一覧がノートブックなら、その ID。落とした先へ「移す」のに使う。
  fromNotebookId: string | null;
};

export function writeDraggedNotes(dataTransfer: DataTransfer, dragged: DraggedNotes): void {
  dataTransfer.setData(NOTE_DRAG_TYPE, JSON.stringify(dragged));
  // 一覧へは移し、本文へはリンクを入れる（写す）ので、どちらも許す。
  dataTransfer.effectAllowed = "copyMove";
}

export function carriesDraggedNotes(dataTransfer: DataTransfer | null): boolean {
  return dataTransfer?.types.includes(NOTE_DRAG_TYPE) ?? false;
}

// 落としたときに読む（ドラッグの途中では、中身は読めない）。メモのドラッグでなければ null。
export function readDraggedNotes(dataTransfer: DataTransfer | null): DraggedNotes | null {
  const data = dataTransfer?.getData(NOTE_DRAG_TYPE) ?? "";
  if (data === "") {
    return null;
  }
  try {
    const dragged = JSON.parse(data) as Partial<DraggedNotes>;
    return Array.isArray(dragged.noteIds) ? { noteIds: dragged.noteIds, fromNotebookId: dragged.fromNotebookId ?? null } : null;
  } catch {
    return null;
  }
}
