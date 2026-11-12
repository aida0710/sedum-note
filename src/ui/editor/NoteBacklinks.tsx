// 開いているメモにリンクしているメモ（バックリンク）の一覧。本文の下に出し、押すとそのメモを開く。
// その下に、題を文字のまま書いているメモ（リンクしていない言及）を畳んで並べ、「リンクにする」で文字をリンクに置き換える。

import { ChevronDown, ChevronRight, FileSymlink, FileText } from "lucide-react";
import { useState } from "react";
import type { UnlinkedMention } from "../../core/notes/noteMentions";
import type { LiveNote } from "../../core/notes/noteRecords";
import type { NoteRepository } from "../../core/notes/noteRepository";
import { translate } from "../i18n/translate";
import { useToast } from "../shared/ToastProvider";

const BACKLINK_ICON_SIZE = 14;

type NoteBacklinksProps = {
  // 開いているメモ。言及をリンクにするとき、このメモへのリンクにする。
  note: LiveNote;
  backlinks: LiveNote[];
  unlinkedMentions: UnlinkedMention[];
  repository: NoteRepository;
  onOpenNote: (noteId: string) => void;
};

function titleOf(note: LiveNote): string {
  return note.content.title || translate("sidebar.untitled");
}

export function NoteBacklinks({ note, backlinks, unlinkedMentions, repository, onOpenNote }: NoteBacklinksProps) {
  const showToast = useToast();
  // 言及は題がたまたま同じ言葉のことも多いので、最初は畳んでおく。
  const [showsMentions, setShowsMentions] = useState(false);
  if (backlinks.length === 0 && unlinkedMentions.length === 0) {
    return null;
  }
  const linkMention = async (mentioningNoteId: string) => {
    const linked = await repository.linkMention(mentioningNoteId, { noteId: note.id, title: note.content.title });
    if (!linked) {
      showToast({ message: translate("editor.mentionNotLinked") });
    }
  };
  return (
    <section className="backlinks" aria-label={translate("editor.backlinks")}>
      {backlinks.length > 0 && <h2>{translate("editor.backlinksCount", { count: backlinks.length })}</h2>}
      {backlinks.map((backlink) => (
        <button key={backlink.id} type="button" className="menu-item" onClick={() => onOpenNote(backlink.id)}>
          <FileSymlink size={BACKLINK_ICON_SIZE} />
          <span className="nav-label">{titleOf(backlink)}</span>
        </button>
      ))}
      {unlinkedMentions.length > 0 && (
        <>
          <h2>
            <button type="button" className="unlinked-mentions-toggle" aria-expanded={showsMentions} onClick={() => setShowsMentions(!showsMentions)}>
              {showsMentions ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              {translate("editor.unlinkedMentionsCount", { count: unlinkedMentions.length })}
            </button>
          </h2>
          {showsMentions && unlinkedMentions.map(({ note: mentioning, excerpt }) => (
            <div key={mentioning.id} className="unlinked-mention">
              <div className="unlinked-mention-head">
                <button type="button" className="menu-item" onClick={() => onOpenNote(mentioning.id)}>
                  <FileText size={BACKLINK_ICON_SIZE} />
                  <span className="nav-label">{titleOf(mentioning)}</span>
                </button>
                <button type="button" className="secondary-button" aria-label={translate("editor.linkMentionIn", { title: titleOf(mentioning) })}
                  onClick={() => void linkMention(mentioning.id)}>
                  {translate("editor.linkMention")}
                </button>
              </div>
              <p className="unlinked-mention-excerpt">{excerpt}</p>
            </div>
          ))}
        </>
      )}
    </section>
  );
}
