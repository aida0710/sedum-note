// 開いているメモにリンクしているメモ（バックリンク）の一覧。本文の下に出し、押すとそのメモを開く。

import { FileSymlink } from "lucide-react";
import type { LiveNote } from "../../core/notes/noteRecords";
import { translate } from "../i18n/translate";

const BACKLINK_ICON_SIZE = 14;

export function NoteBacklinks({ backlinks, onOpenNote }: { backlinks: LiveNote[]; onOpenNote: (noteId: string) => void }) {
  if (backlinks.length === 0) {
    return null;
  }
  return (
    <section className="backlinks" aria-label={translate("editor.backlinks")}>
      <h2>{translate("editor.backlinksCount", { count: backlinks.length })}</h2>
      {backlinks.map((note) => (
        <button key={note.id} type="button" className="menu-item" onClick={() => onOpenNote(note.id)}>
          <FileSymlink size={BACKLINK_ICON_SIZE} />
          <span className="nav-label">{note.content.title || translate("sidebar.untitled")}</span>
        </button>
      ))}
    </section>
  );
}
