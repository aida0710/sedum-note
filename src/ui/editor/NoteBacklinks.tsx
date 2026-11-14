// 開いているメモにリンクしているメモ（バックリンク）の一覧。本文の下に出し、押すとそのメモを開く。

import { FileSymlink } from "lucide-react";
import type { LiveNote } from "../../core/notes/noteRecords";
import { translate } from "../i18n/translate";
import { ICON_SIZE } from "../shared/iconSizes";

type NoteBacklinksProps = {
  backlinks: LiveNote[];
  onOpenNote: (noteId: string) => void;
};

function titleOf(note: LiveNote): string {
  return note.content.title || translate("sidebar.untitled");
}

export function NoteBacklinks({ backlinks, onOpenNote }: NoteBacklinksProps) {
  if (backlinks.length === 0) {
    return null;
  }
  return (
    <section className="backlinks" aria-label={translate("editor.backlinks")}>
      <h2>{translate("editor.backlinksCount", { count: backlinks.length })}</h2>
      {backlinks.map((backlink) => (
        <button key={backlink.id} type="button" className="menu-item" onClick={() => onOpenNote(backlink.id)}>
          <FileSymlink size={ICON_SIZE.row} />
          <span className="nav-label">{titleOf(backlink)}</span>
        </button>
      ))}
    </section>
  );
}
