// 期限の一覧。メモの期限と、期限の印が付いたチェックリストの項目を、期限切れ・今日・これから・完了に分けて並べる。
// 項目は、ここからチェックを付けられる。

import { AlarmClock, ChevronLeft, X } from "lucide-react";
import { useState } from "react";
import { DUE_GROUPS, type DueGroup, type DueItem, dueItemsOf, groupDueItems } from "../../core/notes/dueItems";
import { setDueTaskDone } from "../../core/notes/dueTasks";
import type { NoteSummary } from "../../core/notes/noteQueries";
import type { NoteRepository } from "../../core/notes/noteRepository";
import { type MessageKey, translate } from "../i18n/translate";
import { formatDueTime } from "../shared/formatTime";
import { useToast } from "../shared/ToastProvider";
import { useCurrentTime } from "../shared/useCurrentTime";

// 「期限切れ」への切り替わりを見直す間隔。期限は分の単位なので、1 分より細かく見る。
const DUE_REFRESH_INTERVAL_MILLISECONDS = 30_000;

const GROUP_LABELS: Record<DueGroup, MessageKey> = {
  overdue: "due.overdue", today: "due.today", upcoming: "due.upcoming", done: "due.done",
};

type RemindersViewProps = {
  // ロックで隠しているメモの分は、要約から抜いてある（ここには出ない）。
  summaries: NoteSummary[];
  repository: NoteRepository;
  onOpenNote: (noteId: string) => void;
  // スマホの画面で、一覧へ戻る。PC では渡さない（タブで移る）。
  onBack?: () => void;
};

export function RemindersView({ summaries, repository, onOpenNote, onBack }: RemindersViewProps) {
  const now = useCurrentTime(DUE_REFRESH_INTERVAL_MILLISECONDS);
  const [showsDone, setShowsDone] = useState(false);
  const groups = groupDueItems(dueItemsOf(summaries), now);
  const shownGroups = DUE_GROUPS.filter((group) => groups[group].length > 0 && (group !== "done" || showsDone));
  const hasNothingToDo = DUE_GROUPS.every((group) => group === "done" || groups[group].length === 0);
  return (
    <>
      {/* スマホでは、ほかの画面と同じ上の行（「< 戻る」）を出す。 */}
      {onBack && (
        <div className="phone-top">
          <button type="button" className="phone-back" onClick={onBack}><ChevronLeft size={20} />{translate("editor.back")}</button>
        </div>
      )}
    <div className="document-scroll">
      <div className="reminders-view">
        <div className="reminders-header">
          <h1>{translate("due.title")}</h1>
          {groups.done.length > 0 && (
            <label className="checkbox-line">
              <input type="checkbox" checked={showsDone} onChange={(event) => setShowsDone(event.target.checked)} />
              {translate("due.showDone", { count: groups.done.length })}
            </label>
          )}
        </div>
        {hasNothingToDo && <p className="description">{translate("due.empty")}</p>}
        {shownGroups.map((group) => (
          <section key={group} className={`reminders-group ${group}`} aria-label={translate(GROUP_LABELS[group])}>
            <h2>{translate(GROUP_LABELS[group])}<span>{groups[group].length}</span></h2>
            <ul>
              {groups[group].map((item) => <DueItemRow key={item.key} item={item} repository={repository} onOpenNote={onOpenNote} />)}
            </ul>
          </section>
        ))}
      </div>
    </div>
    </>
  );
}

function DueItemRow({ item, repository, onOpenNote }: { item: DueItem; repository: NoteRepository; onOpenNote: (noteId: string) => void }) {
  const noteTitle = item.noteTitle || translate("sidebar.untitled");
  const { task } = item;
  const showToast = useToast();
  // 期限を外したら、すぐ戻せるようにする（外す前の期限を入れ直す）。
  const removeNoteDue = async () => {
    const dueAt = repository.note(item.noteId)?.content.dueAt ?? null;
    await repository.updateNote(item.noteId, { dueAt: null });
    showToast({
      message: translate("toast.dueRemoved", { title: noteTitle }),
      action: { label: translate("toast.undo"), run: () => void repository.updateNote(item.noteId, { dueAt }) },
    });
  };
  const toggleDone = () => {
    const note = repository.note(item.noteId);
    if (note && task) {
      setDueTaskDone(note.body, task, !task.done);
    }
  };
  return (
    <li className="reminder-row">
      {task
        ? <input type="checkbox" checked={task.done} aria-label={translate("due.markDone", { text: task.text })} onChange={toggleDone} />
        : <AlarmClock size={15} className="reminder-note-mark" aria-hidden />}
      <button type="button" className="reminder-text" onClick={() => onOpenNote(item.noteId)}>
        <span>{task ? task.text || noteTitle : noteTitle}</span>
        <span className="hint">{task ? noteTitle : translate("due.noteDue")}</span>
      </button>
      <time>{formatDueTime(item.dueAt)}</time>
      {!task && (
        <button type="button" className="icon-button" aria-label={translate("due.removeFrom", { title: noteTitle })} title={translate("due.remove")}
          onClick={() => void removeNoteDue()}>
          <X size={14} />
        </button>
      )}
    </li>
  );
}
