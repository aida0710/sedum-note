// 1 件のメモの編集画面（タイトル・タグとノートブックの表示・本文）。
// 打ったものは少し待ってからまとめて暗号化して保存する。

import { type Editor, EditorContent, useEditor } from "@tiptap/react";
import { ChevronLeft, Lock, MoreHorizontal, Star, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { documentHashtags, documentPlainText } from "../../core/notes/documentText";
import type { LiveNote, LiveNotebook } from "../../core/notes/noteRecords";
import type { NoteRepository } from "../../core/notes/noteRepository";
import { translate } from "../i18n/translate";
import { useDialogs } from "../shared/DialogProvider";
import { formatDateTime } from "../shared/formatTime";
import { notebookColor } from "../shared/notebookColor";
import { EditorToolbar } from "./EditorToolbar";
import { createEditorExtensions } from "./editorExtensions";
import { imageFilesOf, insertImageFiles } from "./imageFiles";
import { NoteActionsMenu } from "./NoteActionsMenu";
import { useEditorAutosave } from "./useEditorAutosave";

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
  const [keptCopyTitle, setKeptCopyTitle] = useState<string | null>(null);
  const dialogs = useDialogs();
  const noteId = note.id;
  const inTrash = note.content.trashedAt !== null;
  const editorRef = useRef<Editor | null>(null);
  const autosave = useEditorAutosave({
    repository,
    noteId,
    initialBase: { title: note.content.title, document: note.content.document },
    onKeptAsCopy: (current, copy) => {
      editorRef.current?.commands.setContent((current.content.document as object | null) ?? "", { emitUpdate: false });
      setTitle(current.content.title);
      setKeptCopyTitle(copy.content.title);
    },
  });

  const editor = useEditor({
    extensions: createEditorExtensions(),
    content: (note.content.document as object | null) ?? "",
    editable: !inTrash,
    onUpdate: ({ editor: current }) => autosave.schedule({ document: current.getJSON() }),
    editorProps: {
      handlePaste: (_view, event) => takeImageFiles(imageFilesOf(event.clipboardData?.files)),
      handleDrop: (_view, event) => takeImageFiles(imageFilesOf((event as DragEvent).dataTransfer?.files)),
    },
  }, [noteId]);
  editorRef.current = editor;

  function takeImageFiles(files: File[]): boolean {
    if (files.length === 0 || !editor) {
      return false;
    }
    void insertImageFiles({ files, editor, repository, noteId });
    return true;
  }

  // ほかのデバイスの変更を同期で取り込んだら、編集中でなければ表示を差し替える。
  // 打っている途中のときは差し替えず、保存のときに競合として扱う。
  useEffect(() => {
    if (!editor || autosave.hasPendingChanges()) {
      return;
    }
    if (note.content.document !== null && JSON.stringify(editor.getJSON()) !== JSON.stringify(note.content.document)) {
      editor.commands.setContent(note.content.document as object, { emitUpdate: false });
    }
    setTitle(note.content.title);
    autosave.adoptStoredContent({ title: note.content.title, document: note.content.document });
  }, [editor, autosave, note.content.document, note.content.title]);

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

  const askLink = () => dialogs.prompt({ message: translate("editor.linkPrompt"), initialValue: "https://" });

  if (!editor) {
    return null;
  }
  return (
    <>
      {!isMobile && <EditorToolbar editor={editor} showCamera={false} onImageFiles={takeImageFiles} onAskLink={askLink} trailing={trailing} />}
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
          {keptCopyTitle && (
            <div className="notice" role="status">
              {translate("editor.keptAsCopy", { title: keptCopyTitle })}
              <button className="icon-button" aria-label={translate("common.close")} onClick={() => setKeptCopyTitle(null)}><X size={14} /></button>
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
            onChange={(event) => { setTitle(event.target.value); autosave.schedule({ title: event.target.value }); }}
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
      {isMobile && !inTrash && <EditorToolbar editor={editor} showCamera onImageFiles={takeImageFiles} onAskLink={askLink} />}
      {menuAnchor && (
        <NoteActionsMenu anchor={menuAnchor} note={note} notebooks={notebooks} repository={repository} onClose={() => setMenuAnchor(null)} />
      )}
    </>
  );
}
