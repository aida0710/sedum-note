// 1 件のメモの編集画面。タイトル・タグとノートブックの表示・本文を並べ、ツールバーやメニューから開く部品
// （添付、メモの中の検索、目次、履歴、リンク先の選択、「/」の候補）をつなぐ。それぞれの中身は別のファイルにある。

import { EditorContent, type JSONContent, useEditor } from "@tiptap/react";
import { yXmlFragmentToProsemirrorJSON } from "@tiptap/y-tiptap";
import { ChevronLeft, ListTree, MoreHorizontal, Star } from "lucide-react";
import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { bodyPlainText, NOTE_LINK_NODE, plainTextHashtags } from "../../core/notes/bodyText";
import type { LiveNote, LiveNotebook } from "../../core/notes/noteRecords";
import type { NoteRepository } from "../../core/notes/noteRepository";
import { translate } from "../i18n/translate";
import { UnsyncedRecordsContext } from "../session/useRepositorySnapshot";
import { useMarkdownExport } from "../markdown/useMarkdownExport";
import { printPage } from "../platform/printPage";
import { updateDevicePreferences, useDevicePreferences } from "../preferences/devicePreferences";
import { useDialogs } from "../shared/DialogProvider";
import { PopupMenu } from "../shared/PopupMenu";
import { useAsyncAction } from "../shared/useAsyncAction";
import { formatDateTime } from "../shared/formatTime";
import { assignNotebookColors, NotebookMark } from "../shared/notebookAppearance";
import { EditorToolbar } from "./EditorToolbar";
import { FindBar } from "./FindBar";
import { createEditorExtensions } from "./editorExtensions";
import { NoteActionsMenu } from "./NoteActionsMenu";
import { NoteHistoryDialog } from "./NoteHistoryDialog";
import { NoteLinkPicker } from "./NoteLinkPicker";
import { NoteOutline } from "./NoteOutline";
import { NoteLinkTargetsContext } from "./noteLinkTargets";
import { SlashMenu } from "./SlashMenu";
import { useNoteAttachments } from "./useNoteAttachments";
import { SlashMenuController } from "./slashMenuController";

type NoteEditorProps = {
  note: LiveNote;
  notebooks: LiveNotebook[];
  repository: NoteRepository;
  isMobile: boolean;
  // スマホでは上のバーに「戻る」を出す。
  onBack?: () => void;
  // 一覧の検索で探している言葉。開いたメモの中の当たりに色を付ける。
  highlightedText?: string;
  // メモの中の検索を開く合図（ショートカット）。押すたびに数が増える。
  findRequest?: number;
};

export function NoteEditor({ note, notebooks, repository, isMobile, onBack, highlightedText = "", findRequest = 0 }: NoteEditorProps) {
  const [title, setTitle] = useState(note.content.title);
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [pickingNoteLink, setPickingNoteLink] = useState(false);
  const [showingHistory, setShowingHistory] = useState(false);
  // 目次。PC では本文の横に出したままにでき（設定に覚える）、スマホではメニューで出す。
  const { showOutline } = useDevicePreferences();
  const [outlineAnchor, setOutlineAnchor] = useState<HTMLElement | null>(null);
  const outlineShown = isMobile ? outlineAnchor !== null : showOutline;
  const { openNote } = useContext(NoteLinkTargetsContext);
  const titleInput = useRef<HTMLInputElement>(null);
  const dialogs = useDialogs();
  const attachments = useNoteAttachments(repository);
  const slashMenuController = useMemo(() => new SlashMenuController(), []);
  const unsyncedIds = useContext(UnsyncedRecordsContext);
  const noteId = note.id;
  const inTrash = note.content.trashedAt !== null;

  // 本文は、メモの Yjs の文書をエディタが直接読み書きする。保存と同期は NoteRepository が文書の
  // 変更を見て行い、ほかのデバイスの変更も同じ文書に入るので、開いたまま画面に出る。
  const editor = useEditor({
    extensions: createEditorExtensions(note.body, slashMenuController),
    editable: !inTrash,
    editorProps: {
      handlePaste: (_view, event) => attachments.takeFiles(Array.from(event.clipboardData?.files ?? [])),
      handleDrop: (_view, event) => attachments.takeFiles(Array.from((event as DragEvent).dataTransfer?.files ?? [])),
    },
  }, [noteId]);
  attachments.editor.current = editor;

  const exportMarkdown = useMarkdownExport(repository);
  const print = useAsyncAction(printPage);
  // ほかのデバイスがタイトルを変えたら、打っている最中でなければ表示を差し替える。
  useEffect(() => {
    if (document.activeElement !== titleInput.current) {
      setTitle(note.content.title);
    }
  }, [note.content.title]);

  useEffect(() => {
    editor?.setEditable(!inTrash);
  }, [editor, inTrash]);

  // メモの中の検索。開いている間は、検索の欄の言葉に色を付ける。閉じている間は、一覧の検索の言葉に色を付ける。
  const [findBarOpen, setFindBarOpen] = useState(false);
  const openedFindRequest = useRef(findRequest);
  useEffect(() => {
    if (findRequest !== openedFindRequest.current) {
      openedFindRequest.current = findRequest;
      setFindBarOpen(true);
    }
  }, [findRequest]);
  useEffect(() => {
    if (!findBarOpen) {
      editor?.commands.setSearchQuery(highlightedText);
    }
  }, [editor, findBarOpen, highlightedText]);

  // note は本文が変わるたびに作り直されるので、タグもそのたびに取り直す。
  const tags = useMemo(() => plainTextHashtags(bodyPlainText(note.body)), [note]);
  const notebookColors = assignNotebookColors(notebooks);
  const noteNotebooks = notebooks.filter((notebook) => note.content.notebookIds.includes(notebook.id));

  const trailing = (
    <>
      <button type="button" className={`icon-button${outlineShown ? " active" : ""}`} aria-label={translate("editor.outline")} aria-pressed={outlineShown}
        onClick={(event) => (isMobile ? setOutlineAnchor(outlineAnchor ? null : event.currentTarget) : updateDevicePreferences({ showOutline: !showOutline }))}>
        <ListTree size={16} />
      </button>
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

  const insertNoteLink = (linkedNoteId: string) => {
    setPickingNoteLink(false);
    editor?.chain().focus().insertContent({ type: NOTE_LINK_NODE, attrs: { noteId: linkedNoteId } }).run();
  };
  const askLink = () => dialogs.prompt({ message: translate("editor.linkPrompt"), initialValue: "https://" });
  const { pickImage, pickFile } = attachments;
  const pickNoteLink = () => setPickingNoteLink(true);
  const toolbarActions = {
    onPickImage: pickImage, onPickFile: pickFile, onAskLink: askLink, onPickNoteLink: pickNoteLink,
    // スマホでは、カメラを開いてその場で撮れる。
    onCapturePhoto: isMobile ? attachments.capturePhoto : undefined,
  };
  // テンプレートの本文を、カーソルの所に入れる。
  const insertTemplate = (templateId: string) => {
    const template = repository.note(templateId);
    if (template && editor) {
      editor.chain().focus().insertContent((yXmlFragmentToProsemirrorJSON(template.body) as JSONContent).content ?? []).run();
    }
  };
  const templates = repository.notes()
    .filter((candidate) => candidate.content.isTemplate && candidate.content.trashedAt === null && candidate.id !== noteId)
    .map((template) => ({ id: template.id, title: template.content.title }));
  slashMenuController.actions = { pickImage, pickFile, pickNoteLink, templates, insertTemplate };

  const actionError = attachments.errorMessage ?? exportMarkdown.errorMessage ?? print.errorMessage;
  if (!editor) {
    return null;
  }
  return (
    <>
      {!isMobile && <EditorToolbar editor={editor} {...toolbarActions} trailing={trailing} />}
      {isMobile && (
        <div className="phone-top">
          <button className="phone-back" onClick={onBack}><ChevronLeft size={20} />{translate("editor.back")}</button>
          <div className="phone-top-end">{trailing}</div>
        </div>
      )}
      {findBarOpen && <FindBar editor={editor} focusRequest={findRequest} onClose={() => setFindBarOpen(false)} />}
      <div className="document-area">
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
          {note.content.isTemplate && !inTrash && (
            <div className="trash-banner">
              {translate("editor.isTemplate")}
              <span className="actions">
                <button className="secondary-button" onClick={async () => openNote((await repository.createNoteFromTemplate(noteId, { isTemplate: false })).id)}>
                  {translate("editor.newFromTemplate")}
                </button>
              </span>
            </div>
          )}
          {actionError && <div className="form-error" role="alert">{actionError}</div>}
          <div className="document-meta">
            {noteNotebooks.map((notebook) => (
              <span key={notebook.id} className="chip"><NotebookMark notebook={notebook} colors={notebookColors} />{notebook.content.name}</span>
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
      {!isMobile && showOutline && <NoteOutline editor={editor} />}
      </div>
      {outlineAnchor && (
        <PopupMenu anchor={outlineAnchor} onClose={() => setOutlineAnchor(null)}>
          <NoteOutline editor={editor} onPick={() => setOutlineAnchor(null)} />
        </PopupMenu>
      )}
      {isMobile && !inTrash && <EditorToolbar editor={editor} {...toolbarActions} />}
      {attachments.fileInputs}
      <SlashMenu controller={slashMenuController} />
      {pickingNoteLink && (
        <NoteLinkPicker candidates={repository.notes().filter((candidate) => candidate.id !== noteId && candidate.content.trashedAt === null)}
          onPick={insertNoteLink} onCancel={() => setPickingNoteLink(false)} />
      )}
      {menuAnchor && (
        <NoteActionsMenu anchor={menuAnchor} note={note} notebooks={notebooks} repository={repository}
          onFind={() => setFindBarOpen(true)}
          onPrint={() => void print.run(undefined)}
          onShowHistory={() => setShowingHistory(true)} onExportMarkdown={() => void exportMarkdown.run([note])} onClose={() => setMenuAnchor(null)} />
      )}
      {showingHistory && (
        <NoteHistoryDialog note={note} repository={repository} onClose={() => setShowingHistory(false)}
          onRestored={(restoredNoteId) => { setShowingHistory(false); openNote(restoredNoteId); }} />
      )}
    </>
  );
}
