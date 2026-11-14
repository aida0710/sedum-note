// 画面分割の右側。メモを 1 つ、左のタブとは別に開いたままにする（2 つのメモを見比べる・写す）。

import { X } from "lucide-react";
import { notesLinkingTo } from "../../core/notes/noteQueries";
import type { LiveNote } from "../../core/notes/noteRecords";
import type { NoteRepository } from "../../core/notes/noteRepository";
import { NoteEditor } from "../editor/NoteEditor";
import { createNoteLinkTargets, NoteLinkTargetsContext } from "../editor/noteLinkTargets";
import { NoteQuerySourceContext } from "../editor/noteQuerySource";
import { translate } from "../i18n/translate";
import type { RepositorySnapshot } from "../session/useRepositorySnapshot";
import type { WorkspaceNavigation } from "./useWorkspaceNavigation";
import { ICON_SIZE } from "../shared/iconSizes";

type SplitNotePaneProps = {
  note: LiveNote;
  snapshot: RepositorySnapshot;
  repository: NoteRepository;
  navigation: WorkspaceNavigation;
};

export function SplitNotePane({ note, snapshot, repository, navigation }: SplitNotePaneProps) {
  return (
    <section className="pane split-pane" aria-label={translate("split.paneLabel")}>
      <header className="split-pane-header">
        <span className="nav-label">{note.content.title || translate("sidebar.untitled")}</span>
        <button type="button" className="icon-button" aria-label={translate("split.close")} title={translate("split.close")} onClick={navigation.closeSplit}>
          <X size={ICON_SIZE.row} />
        </button>
      </header>
      {/* 右側のメモの中のリンクは、左のタブで開く（右側は、開いたメモのままにする）。 */}
      <NoteLinkTargetsContext.Provider value={createNoteLinkTargets({ repository, navigation })}>
        <NoteQuerySourceContext.Provider value={{ summaries: snapshot.summaries, notebooks: snapshot.notebooks }}>
          <NoteEditor key={note.id} note={note} notebooks={snapshot.notebooks} backlinks={notesLinkingTo(snapshot.summaries, note.id)} repository={repository} isMobile={false} />
        </NoteQuerySourceContext.Provider>
      </NoteLinkTargetsContext.Provider>
    </section>
  );
}
