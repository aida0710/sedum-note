// スマホのメモの一覧が空のときの表示。一覧の種類に合った文と、次にできる操作（メモを作る）を出す。
// 右下の「＋」に気づかなくても、ここから作れるようにする（PC の EmptyEditorPane.tsx と同じ考え方）。

import { Plus } from "lucide-react";
import type { NoteView } from "../../core/notes/noteQueries";
import { translate } from "../i18n/translate";
import { ICON_SIZE } from "../shared/iconSizes";

type EmptyNoteListProps = {
  view: NoteView;
  // 検索の欄の文字（前後の空白を除いたもの）。空なら検索していない。
  searchText: string;
  // 開いている一覧に合わせてメモを作る（title を渡すと、その題で作る）。
  onCreateNote: (title: string) => void;
};

export function EmptyNoteList({ view, searchText, onCreateNote }: EmptyNoteListProps) {
  if (searchText !== "") {
    return (
      <div className="empty-state">
        <p>{translate("mobile.noSearchResults", { query: searchText })}</p>
        <button type="button" className="secondary-button" onClick={() => onCreateNote(searchText)}>
          {translate("palette.createNote", { title: searchText })}
        </button>
      </div>
    );
  }
  if (view.kind === "trash") {
    return <div className="empty-state"><p>{translate("editor.emptyTrash")}</p></div>;
  }
  return (
    <div className="empty-state">
      <p>{translate(view.kind === "bookmarked" ? "mobile.noBookmarkedNotes" : view.kind === "templates" ? "mobile.noTemplates" : "sidebar.noNotes")}</p>
      {view.kind === "bookmarked" && <p className="hint">{translate("mobile.noBookmarkedNotesHint")}</p>}
      <button type="button" className="primary-button" onClick={() => onCreateNote("")}>
        <Plus size={ICON_SIZE.button} />{translate(view.kind === "templates" ? "mobile.createTemplate" : "common.createNote")}
      </button>
    </div>
  );
}
