// 1 件のメモの編集画面（タイトル・タグとノートブックの表示・本文）。

import { EditorContent, useEditor } from "@tiptap/react";
import { ChevronLeft, Lock, MoreHorizontal, Star } from "lucide-react";
import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { bodyPlainText, plainTextHashtags } from "../../core/notes/bodyText";
import type { LiveNote, LiveNotebook } from "../../core/notes/noteRecords";
import type { NoteRepository } from "../../core/notes/noteRepository";
import { translate } from "../i18n/translate";
import { UnsyncedRecordsContext } from "../session/useRepositorySnapshot";
import { useDialogs } from "../shared/DialogProvider";
import { formatDateTime } from "../shared/formatTime";
import { assignNotebookColors } from "../shared/notebookColor";
import { EditorToolbar } from "./EditorToolbar";
import { createEditorExtensions } from "./editorExtensions";
import { imageFilesOf, insertImageFiles } from "./imageFiles";
import { NoteActionsMenu } from "./NoteActionsMenu";

type NoteEditorProps = {
  note: LiveNote;
  notebooks: LiveNotebook[];
  repository: NoteRepository;
  syncConfigured: boolean;
  isMobile: boolean;
  // スマホでは上のバーに「戻る」を出す。
  onBack?: () => void;
};

export function NoteEditor({ note, notebooks, repository, syncConfigured, isMobile, onBack }: NoteEditorProps) {
  const [title, setTitle] = useState(note.content.title);
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const titleInput = useRef<HTMLInputElement>(null);
  const dialogs = useDialogs();
  const unsyncedIds = useContext(UnsyncedRecordsContext);
  const noteId = note.id;
  const inTrash = note.content.trashedAt !== null;

  // 本文は、メモの Yjs の文書をエディタが直接読み書きする。保存と同期は NoteRepository が文書の
  // 変更を見て行い、ほかのデバイスの変更も同じ文書に入るので、開いたまま画面に出る。
  const editor = useEditor({
    extensions: createEditorExtensions(note.body),
    editable: !inTrash,
    editorProps: {
      handlePaste: (_view, event) => takeImageFiles(imageFilesOf(event.clipboardData?.files)),
      handleDrop: (_view, event) => takeImageFiles(imageFilesOf((event as DragEvent).dataTransfer?.files)),
    },
  }, [noteId]);

  function takeImageFiles(files: File[]): boolean {
    if (files.length === 0 || !editor) {
      return false;
    }
    void insertImageFiles({ files, editor, repository });
    return true;
  }

  // ほかのデバイスがタイトルを変えたら、打っている最中でなければ表示を差し替える。
  useEffect(() => {
    if (document.activeElement !== titleInput.current) {
      setTitle(note.content.title);
    }
  }, [note.content.title]);

  useEffect(() => {
    editor?.setEditable(!inTrash);
  }, [editor, inTrash]);

  // note は本文が変わるたびに作り直されるので、タグもそのたびに取り直す。
  const tags = useMemo(() => plainTextHashtags(bodyPlainText(note.body)), [note]);
  const notebookColors = assignNotebookColors(notebooks);
  const noteNotebooks = notebooks.filter((notebook) => note.content.notebookIds.includes(notebook.id));

  const trailing = (
    <>
      {!isMobile && (
        <span className={`badge-lock${syncConfigured ? "" : " local"}`}>
          <Lock size={13} />{translate(syncConfigured ? "editor.encryptedBadge" : "editor.localOnlyBadge")}
        </span>
      )}
      <button type="button" className={`icon-button${note.content.bookmarked ? " on" : ""}`}
        aria-label={translate(note.content.bookmarked ? "editor.unbookmark" : "editor.bookmark")}
        onClick={() => void repository.updateNote(noteId, { bookmarked: !note.content.bookmarked })}>
        <Star size={16} fill={note.content.bookmarked ? "currentColor" : "none"} />
      </button>
      <button type="button" className="icon-button" aria-label={translate("editor.more")} aria-haspopup="menu"
        onClick={(event) => setMenuAnchor(menuAnchor ? null : event.currentTarget)}>
        <MoreHorizontal size={16} />
      </button>
    </>
  );

  const askLink = () => dialogs.prompt({ message: translate("editor.linkPrompt"), initialValue: "https://" });

  if (!editor) {
    return null;
  }
  return (
    <>
      {!isMobile && <EditorToolbar editor={editor} onImageFiles={takeImageFiles} onAskLink={askLink} trailing={trailing} />}
      {isMobile && (
        <div className="phone-top">
          <button className="phone-back" onClick={onBack}><ChevronLeft size={20} />{translate("editor.back")}</button>
          <div className="phone-top-end">{trailing}</div>
        </div>
      )}
      <div className="document-scroll">
        <div className="document">
          {inTrash && (
            <div className="trash-banner">
              {translate("editor.inTrash")}
              <span className="actions">
                <button className="secondary-button" onClick={() => void repository.restoreNoteFromTrash(noteId)}>{translate("editor.restore")}</button>
                <button className="danger-button" onClick={async () => {
                  const accepted = await dialogs.confirm({
                    message: translate("editor.removePermanentlyConfirm"), confirmLabel: translate("editor.removePermanently"), danger: true,
                  });
                  if (accepted) {
                    await repository.removeNotePermanently(noteId);
                  }
                }}>{translate("editor.removePermanently")}</button>
              </span>
            </div>
          )}
          <div className="document-meta">
            {noteNotebooks.map((notebook) => (
              <span key={notebook.id} className="chip"><span className="dot" style={{ background: notebookColors.colorOf(notebook.id) }} />{notebook.content.name}</span>
            ))}
            {tags.map((tag) => <span key={tag} className="chip">#{tag}</span>)}
            {unsyncedIds.has(noteId) && <span className="chip unsynced">{translate("editor.unsynced")}</span>}
            <span className="updated">{translate("editor.updatedAt", { time: formatDateTime(note.updatedAt) })}</span>
          </div>
          {/* 作ったばかりの空のメモは、すぐ打てるようにタイトルにカーソルを置く。 */}
          <input ref={titleInput} className="title-input" value={title} placeholder={translate("editor.titlePlaceholder")} readOnly={inTrash}
            autoFocus={note.content.title === "" && bodyPlainText(note.body) === "" && note.content.attachments.length === 0}
            onChange={(event) => { setTitle(event.target.value); void repository.updateNote(noteId, { title: event.target.value }); }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.nativeEvent.isComposing) {
                event.preventDefault();
                // focus コマンドは次の描画まで待つので、続けて打った文字がタイトルに入る。
                // その場で本文へ移す。
                editor.view.focus();
                editor.commands.setTextSelection(1);
              }
            }} />
          <EditorContent editor={editor} />
        </div>
      </div>
      {isMobile && !inTrash && <EditorToolbar editor={editor} onImageFiles={takeImageFiles} onAskLink={askLink} />}
      {menuAnchor && (
        <NoteActionsMenu anchor={menuAnchor} note={note} notebooks={notebooks} repository={repository} onClose={() => setMenuAnchor(null)} />
      )}
    </>
  );
}
