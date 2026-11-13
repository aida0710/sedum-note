// ノートブックの「…」の「移動…」で開く、移し先を選ぶダイアログ。ドラッグできない人（キーボード・スマホ）も、
// ノートブックを別のノートブックの中か最上位の階層へ移せるようにする。

import type { LiveNotebook } from "../../core/notes/noteRecords";
import type { NoteRepository } from "../../core/notes/noteRepository";
import { translate } from "../i18n/translate";
import { SearchablePicker } from "../shared/SearchablePicker";
import { notebookMoveChoices, TOP_LEVEL_CHOICE_ID } from "./notebookMoveTargets";

type MoveNotebookDialogProps = {
  notebook: LiveNotebook;
  repository: NoteRepository;
  // 移したあと。parentId は移した先（null は最上位の階層）。左の列は、移し先を開いて見せる。
  onMoved?: (parentId: string | null) => void;
  onClose: () => void;
};

export function MoveNotebookDialog({ notebook, repository, onMoved, onClose }: MoveNotebookDialogProps) {
  const moveTo = async (choiceId: string) => {
    onClose();
    const parentId = choiceId === TOP_LEVEL_CHOICE_ID ? null : choiceId;
    await repository.moveNotebook(notebook.id, parentId);
    onMoved?.(parentId);
  };
  return (
    <SearchablePicker title={translate("notebook.moveTitle", { name: notebook.content.name })}
      choices={notebookMoveChoices(repository.notebooks(), notebook.id, translate("notebook.moveToTopLevel"))}
      searchPlaceholder={translate("editor.notebookPickerSearchPlaceholder")} emptyMessage={translate("editor.notebookPickerNone")}
      onPick={(choiceId) => void moveTo(choiceId)} onCancel={onClose} />
  );
}
