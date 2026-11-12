// メモの「…」メニュー: ピン留め、ノートブックの付け外し、本文の配置（PC だけ）、テンプレートにする、複製、結合、メモの中の検索、アウトライン表示の切り替え、箇条書きへのズーム、期限、AI チャット、履歴、ファイルへの書き出し、印刷、ロック、ゴミ箱。

import { AlarmClock, Check, Copy, FileDown, History, ListTree, Merge, LayoutTemplate, LockKeyhole, LockKeyholeOpen, Pin, PinOff, Printer, Search, Sparkles, Trash2, ZoomIn } from "lucide-react";
import type { LiveNote, LiveNotebook } from "../../core/notes/noteRecords";
import type { NoteRepository } from "../../core/notes/noteRepository";
import { type MessageKey, translate } from "../i18n/translate";
import type { NoteFileFormat } from "../markdown/noteFileExport";
import { isPrintAvailable } from "../platform/printPage";
import { PopupMenu } from "../shared/PopupMenu";
import { useTrashWithUndo } from "../workspace/useTrashWithUndo";
import { PageAlignmentChoices } from "./PageAlignmentChoices";

const EXPORT_FORMATS: Array<{ format: NoteFileFormat; label: MessageKey }> = [
  { format: "markdown", label: "editor.exportMarkdown" },
  { format: "html", label: "editor.exportHtml" },
  { format: "text", label: "editor.exportText" },
];

type NoteActionsMenuProps = {
  anchor: HTMLElement;
  note: LiveNote;
  notebooks: LiveNotebook[];
  repository: NoteRepository;
  onFind: () => void;
  onPrint: () => void;
  onDuplicate: () => Promise<unknown>;
  onMergeNote: () => void;
  onOpenAiAssistant: () => void;
  // アウトライン表示と、ふつうの表示を切り替える。
  onToggleOutline: () => void;
  // カーソルのある箇条書きの項目にズームする。カーソルが項目の中に無ければ undefined。
  onZoomIntoItem: (() => void) | undefined;
  // メモの期限を選ぶ画面を開く。
  onSetNoteDue: () => void;
  // カーソルのあるチェックリストの項目の期限を選ぶ画面を開く。カーソルが項目の中に無ければ undefined。
  onSetTaskDue: (() => void) | undefined;
  onShowHistory: () => void;
  onExport: (format: NoteFileFormat) => void;
  // 本文の列の置き場所を選べるか。スマホの幅では列が画面いっぱいなので出さない。
  canChoosePageAlignment: boolean;
  onClose: () => void;
};

export function NoteActionsMenu({ anchor, note, notebooks, repository, onFind, onPrint, onDuplicate, onMergeNote, onOpenAiAssistant, onToggleOutline, onZoomIntoItem, onSetNoteDue, onSetTaskDue, onShowHistory, onExport, canChoosePageAlignment, onClose }: NoteActionsMenuProps) {
  const { content } = note;
  const moveToTrash = useTrashWithUndo(repository);
  const toggleNotebook = (notebookId: string) => {
    const notebookIds = content.notebookIds.includes(notebookId)
      ? content.notebookIds.filter((id) => id !== notebookId)
      : [...content.notebookIds, notebookId];
    void repository.updateNote(note.id, { notebookIds });
  };
  const runAndClose = (action: () => Promise<unknown>) => () => {
    onClose();
    void action();
  };
  return (
    <PopupMenu anchor={anchor} onClose={onClose}>
      <button className="menu-item" role="menuitem" onClick={runAndClose(() => repository.updateNote(note.id, { pinned: !content.pinned }))}>
        {content.pinned ? <PinOff size={15} /> : <Pin size={15} />}
        {translate(content.pinned ? "editor.unpin" : "editor.pin")}
      </button>
      {notebooks.length > 0 && (
        <>
          <div className="menu-separator" />
          <div className="menu-heading">{translate("editor.notebooks")}</div>
          {notebooks.map((notebook) => (
            <button key={notebook.id} className="menu-item" role="menuitemcheckbox" aria-checked={content.notebookIds.includes(notebook.id)} onClick={() => toggleNotebook(notebook.id)}>
              <span className="nav-label">{notebook.content.name}</span>
              {content.notebookIds.includes(notebook.id) && <Check size={15} className="menu-check" />}
            </button>
          ))}
        </>
      )}
      {canChoosePageAlignment && (
        <>
          <div className="menu-separator" />
          <PageAlignmentChoices selected={content.pageAlignment} onChoose={(pageAlignment) => runAndClose(() => repository.updateNote(note.id, { pageAlignment }))()} />
        </>
      )}
      <div className="menu-separator" />
      <button className="menu-item" role="menuitem" onClick={runAndClose(() => repository.updateNote(note.id, { isTemplate: !content.isTemplate, pinned: false }))}>
        <LayoutTemplate size={15} />{translate(content.isTemplate ? "editor.stopBeingTemplate" : "editor.makeTemplate")}
      </button>
      <button className="menu-item" role="menuitem" onClick={runAndClose(onDuplicate)}>
        <Copy size={15} />{translate("editor.duplicate")}
      </button>
      {content.trashedAt === null && (
        <button className="menu-item" role="menuitem" onClick={() => { onClose(); onMergeNote(); }}>
          <Merge size={15} />{translate("editor.mergeNote")}
        </button>
      )}
      <button className="menu-item" role="menuitem" onClick={() => { onClose(); onFind(); }}>
        <Search size={15} />{translate("editor.find")}
      </button>
      {content.trashedAt === null && (
        <button className="menu-item" role="menuitem" onClick={() => { onClose(); onToggleOutline(); }}>
          <ListTree size={15} />{translate(content.isOutline ? "editor.stopBeingOutline" : "editor.makeOutline")}
        </button>
      )}
      {onZoomIntoItem && (
        <button className="menu-item" role="menuitem" onClick={() => { onClose(); onZoomIntoItem(); }}>
          <ZoomIn size={15} />{translate("editor.zoomIntoItem")}
        </button>
      )}
      {content.trashedAt === null && (
        <button className="menu-item" role="menuitem" onClick={() => { onClose(); onSetNoteDue(); }}>
          <AlarmClock size={15} />{translate("due.setForNote")}
        </button>
      )}
      {onSetTaskDue && (
        <button className="menu-item" role="menuitem" onClick={() => { onClose(); onSetTaskDue(); }}>
          <AlarmClock size={15} />{translate("due.setForTask")}
        </button>
      )}
      {/* 開いているメモは、もうパスフレーズを確かめてある。ロックを外すのに、もう一度は聞かない。 */}
      <button className="menu-item" role="menuitem" onClick={runAndClose(() => repository.updateNote(note.id, { isLocked: !content.isLocked }))}>
        {content.isLocked ? <LockKeyholeOpen size={15} /> : <LockKeyhole size={15} />}{translate(content.isLocked ? "lock.unlockNote" : "lock.lockNote")}
      </button>
      <button className="menu-item" role="menuitem" onClick={() => { onClose(); onOpenAiAssistant(); }}>
        <Sparkles size={15} />{translate("ai.assistant")}
      </button>
      <button className="menu-item" role="menuitem" onClick={() => { onClose(); onShowHistory(); }}>
        <History size={15} />{translate("editor.history")}
      </button>
      {EXPORT_FORMATS.map(({ format, label }) => (
        <button key={format} className="menu-item" role="menuitem" onClick={() => { onClose(); onExport(format); }}>
          <FileDown size={15} />{translate(label)}
        </button>
      ))}
      {isPrintAvailable() && (
        <button className="menu-item" role="menuitem" onClick={() => { onClose(); onPrint(); }}>
          <Printer size={15} />{translate("editor.print")}
        </button>
      )}
      <button className="menu-item danger" role="menuitem" onClick={runAndClose(() => moveToTrash(note.id))}>
        <Trash2 size={15} />{translate("editor.moveToTrash")}
      </button>
    </PopupMenu>
  );
}
