// メモをドラッグするときに、ブラウザのドラッグのデータ（dataTransfer）に入れる中身。
// 左の列の一覧（ノートブックへ移す）と、本文（リンクを入れる）の両方が読む。

// ドラッグのデータの種類。ほかのアプリやファイルのドラッグと区別する。
const NOTE_DRAG_TYPE = "application/x-sedum-note";

export type DraggedNote = {
  noteId: string;
  // ドラッグを始めた一覧がノートブックなら、その ID。落とした先へ「移す」のに使う。
  fromNotebookId: string | null;
};

export function writeDraggedNote(dataTransfer: DataTransfer, dragged: DraggedNote): void {
  dataTransfer.setData(NOTE_DRAG_TYPE, JSON.stringify(dragged));
  // 一覧へは移し、本文へはリンクを入れる（写す）ので、どちらも許す。
  dataTransfer.effectAllowed = "copyMove";
}

export function carriesDraggedNote(dataTransfer: DataTransfer | null): boolean {
  return dataTransfer?.types.includes(NOTE_DRAG_TYPE) ?? false;
}

// 落としたときに読む（ドラッグの途中では、中身は読めない）。メモのドラッグでなければ null。
export function readDraggedNote(dataTransfer: DataTransfer | null): DraggedNote | null {
  const data = dataTransfer?.getData(NOTE_DRAG_TYPE) ?? "";
  if (data === "") {
    return null;
  }
  try {
    return JSON.parse(data) as DraggedNote;
  } catch {
    return null;
  }
}
