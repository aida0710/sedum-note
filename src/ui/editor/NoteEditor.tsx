// 1 件のメモの編集画面（タイトル・タグとノートブックの表示・本文）。
// 打ったものは少し待ってからまとめて暗号化して保存する。

import { EditorContent, useEditor } from "@tiptap/react";
import { ChevronLeft, Lock, MoreHorizontal, Star } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { documentHashtags, documentPlainText } from "../../core/notes/documentText";
import type { LiveNote, LiveNotebook } from "../../core/notes/noteRecords";
import type { NoteRepository } from "../../core/notes/noteRepository";
import { translate } from "../i18n/translate";
import { formatDateTime } from "../shared/formatTime";
import { notebookColor } from "../shared/notebookColor";
import { EditorToolbar } from "./EditorToolbar";
import { createEditorExtensions } from "./editorExtensions";
import { imageFilesOf, insertImageFiles } from "./imageFiles";
import { NoteActionsMenu } from "./NoteActionsMenu";

// 打ち終わってからこれだけ待って保存する。毎打鍵の暗号化と書き込みを避ける。
const SAVE_DELAY_MILLISECONDS = 500;

type NoteEditorProps = {
  note: LiveNote;
  notebooks: LiveNotebook[];
  repository: NoteRepository;
  syncConfigured: boolean;
  isMobile: boolean;
  // スマホでは上のバーに「戻る」を出す。
  onBack?: () => void;
};

type PendingSave = { title?: string; document?: unknown };

export function NoteEditor({ note, notebooks, repository, syncConfigured, isMobile, onBack }: NoteEditorProps) {
  const [title, setTitle] = useState(note.content.title);
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const pendingSave = useRef<PendingSave>({});
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const noteId = note.id;
  const inTrash = note.content.trashedAt !== null;

  const flushSave = () => {
    if (saveTimer.current !== null) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    const changes = pendingSave.current;
    pendingSave.current = {};
    if (Object.keys(changes).length > 0 && repository.note(noteId)) {
      void repository.updateNote(noteId, changes);
    }
  };
  const scheduleSave = (changes: PendingSave) => {
    pendingSave.current = { ...pendingSave.current, ...changes };
    if (saveTimer.current !== null) {
      clearTimeout(saveTimer.current);
    }
    saveTimer.current = setTimeout(flushSave, SAVE_DELAY_MILLISECONDS);
  };
  const flushSaveRef = useRef(flushSave);
  flushSaveRef.current = flushSave;
  useEffect(() => () => flushSaveRef.current(), []);

  const editor = useEditor({
    extensions: createEditorExtensions(),
    content: (note.content.document as object | null) ?? "",
    editable: !inTrash,
    onUpdate: ({ editor: current }) => scheduleSave({ document: current.getJSON() }),
    editorProps: {
      handlePaste: (_view, event) => takeImageFiles(imageFilesOf(event.clipboardData?.files)),
      handleDrop: (_view, event) => takeImageFiles(imageFilesOf((event as DragEvent).dataTransfer?.files)),
    },
  }, [noteId]);

  function takeImageFiles(files: File[]): boolean {
    if (files.length === 0 || !editor) {
      return false;
    }
    void insertImageFiles({ files, editor, repository, noteId });
    return true;
  }

  // ほかのデバイスの変更を同期で取り込んだら、編集中でなければ表示を差し替える。
  useEffect(() => {
    if (!editor || saveTimer.current !== null) {
      return;
    }
    if (JSON.stringify(editor.getJSON()) !== JSON.stringify(note.content.document) && note.content.document !== null) {
      editor.commands.setContent(note.content.document as object, { emitUpdate: false });
    }
    if (document.activeElement?.classList.contains("title-input") !== true) {
      setTitle(note.content.title);
    }
  }, [editor, note.content.document, note.content.title]);

  useEffect(() => {
    editor?.setEditable(!inTrash);
  }, [editor, inTrash]);

  const plainText = useMemo(() => documentPlainText(note.content.document), [note.content.document]);
  const tags = useMemo(() => documentHashtags(plainText), [plainText]);
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

  if (!editor) {
    return null;
  }
  return (
    <>
      {!isMobile && <EditorToolbar editor={editor} showCamera={false} onImageFiles={takeImageFiles} trailing={trailing} />}
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
                <button className="danger-button" onClick={() => {
                  if (window.confirm(translate("editor.removePermanentlyConfirm"))) {
                    void repository.removeNotePermanently(noteId);
                  }
                }}>{translate("editor.removePermanently")}</button>
              </span>
            </div>
          )}
          <div className="document-meta">
            {noteNotebooks.map((notebook) => (
              <span key={notebook.id} className="chip"><span className="dot" style={{ background: notebookColor(notebook.id) }} />{notebook.content.name}</span>
            ))}
            {tags.map((tag) => <span key={tag} className="chip">#{tag}</span>)}
            <span className="updated">{translate("editor.updatedAt", { time: formatDateTime(note.updatedAt) })}</span>
          </div>
          <input className="title-input" value={title} placeholder={translate("editor.titlePlaceholder")} readOnly={inTrash}
            onChange={(event) => { setTitle(event.target.value); scheduleSave({ title: event.target.value }); }}
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
      {isMobile && !inTrash && <EditorToolbar editor={editor} showCamera onImageFiles={takeImageFiles} />}
      {menuAnchor && (
        <NoteActionsMenu anchor={menuAnchor} note={note} notebooks={notebooks} repository={repository} onClose={() => setMenuAnchor(null)} />
      )}
    </>
  );
}
