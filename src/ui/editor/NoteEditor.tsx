// 1 件のメモの編集画面。タイトル・タグとノートブックの表示・本文を並べ、ツールバーやメニューから開く部品
// （添付、メモの中の検索、目次、履歴、リンク先の選択、「/」の候補）をつなぐ。それぞれの中身は別のファイルにある。

import { type Editor, EditorContent, type JSONContent, useEditor } from "@tiptap/react";
import { yXmlFragmentToProsemirrorJSON } from "@tiptap/y-tiptap";
import { ChevronLeft, ListTree, MoreHorizontal, Star } from "lucide-react";
import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { bodyPlainText, BLOCK_EMBED_NODE, NOTE_LINK_NODE, plainTextHashtags } from "../../core/notes/bodyText";
import type { LiveNote, LiveNotebook } from "../../core/notes/noteRecords";
import type { NoteRepository } from "../../core/notes/noteRepository";
import { translate } from "../i18n/translate";
import { UnsyncedRecordsContext } from "../session/useRepositorySnapshot";
import { useNoteFileExport } from "../markdown/useNoteFileExport";
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
import { NotePicker } from "./NotePicker";
import { BlockPicker } from "./BlockPicker";
import { revealBlock } from "./blockIds";
import { NoteOutline } from "./NoteOutline";
import { NoteLinkTargetsContext } from "./noteLinkTargets";
import { insertPastedMarkdown, markdownInClipboard } from "./pastedMarkdown";
import { SlashMenu } from "./SlashMenu";
import { useNoteAttachments } from "./useNoteAttachments";
import { SlashMenuController } from "./slashMenuController";
import { isImeKeyEvent } from "../shared/imeKeyEvent";
import { NoteCharacterCount } from "./NoteCharacterCount";
import { NoteBacklinks } from "./NoteBacklinks";
import { NoteProperties } from "./NoteProperties";
import { propertiesOfNote } from "../../core/notes/noteProperties";
import { NoteFootnotes } from "./NoteFootnotes";
import { isAudioRecordingAvailable, useAudioRecorder } from "./useAudioRecorder";
import { useAiChatSession } from "../ai/aiChatSession";

type NoteEditorProps = {
  note: LiveNote;
  notebooks: LiveNotebook[];
  repository: NoteRepository;
  isMobile: boolean;
  // スマホでは上のバーに「戻る」を出す。
  onBack?: () => void;
  // このメモにリンクしているメモ（バックリンク）。
  backlinks: LiveNote[];
  // 一覧の検索で探している言葉。開いたメモの中の当たりに色を付ける。
  highlightedText?: string;
  // メモの中の検索を開く合図（ショートカット）。押すたびに数が増える。
  findRequest?: number;
};

export function NoteEditor({ note, notebooks, backlinks, repository, isMobile, onBack, highlightedText = "", findRequest = 0 }: NoteEditorProps) {
  const [title, setTitle] = useState(note.content.title);
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [pickingNoteLink, setPickingNoteLink] = useState(false);
  // ブロックを選んでいる途中なら、選んだあとに入れるもの（リンクか埋め込み）。
  const [pickingBlockFor, setPickingBlockFor] = useState<"link" | "embed" | null>(null);
  const [pickingNoteToMerge, setPickingNoteToMerge] = useState(false);
  const [showingHistory, setShowingHistory] = useState(false);
  // 目次。PC では本文の横に出したままにでき（設定に覚える）、スマホではメニューで出す。
  const { showOutline } = useDevicePreferences();
  const [outlineAnchor, setOutlineAnchor] = useState<HTMLElement | null>(null);
  const outlineShown = isMobile ? outlineAnchor !== null : showOutline;
  const { openNote, blockToReveal } = useContext(NoteLinkTargetsContext);
  const titleInput = useRef<HTMLInputElement>(null);
  const dialogs = useDialogs();
  const attachments = useNoteAttachments(repository);
  // 録った音は、ほかのファイルと同じように添付する。
  const audioRecorder = useAudioRecorder((file) => attachments.takeFiles([file]));
  // 貼り付けの処理が使うエディタ。エディタを作るときに貼り付けの処理を渡すので、作ったあとに入れる。
  const editorOfPaste = useRef<Editor | null>(null);
  const slashMenuController = useMemo(() => new SlashMenuController(), []);
  const unsyncedIds = useContext(UnsyncedRecordsContext);
  const noteId = note.id;
  const inTrash = note.content.trashedAt !== null;

  const pasteMarkdown = useAsyncAction(async (markdown: string) => {
    if (editorOfPaste.current) {
      await insertPastedMarkdown(editorOfPaste.current, markdown, { noteExists: (id) => repository.note(id) !== undefined });
    }
  });
  // 貼り付けた文字が Markdown なら書式つきで入れ、true を返す（エディタの既定の処理を止める合図）。
  // コードの中では、書いたとおりの文字で入れたいので取り込まない。
  const takeMarkdown = (clipboard: DataTransfer | null): boolean => {
    const markdown = editorOfPaste.current?.isActive("codeBlock") ? null : markdownInClipboard(clipboard);
    if (markdown === null) {
      return false;
    }
    void pasteMarkdown.run(markdown);
    return true;
  };

  // 本文は、メモの Yjs の文書をエディタが直接読み書きする。保存と同期は NoteRepository が文書の
  // 変更を見て行い、ほかのデバイスの変更も同じ文書に入るので、開いたまま画面に出る。
  const editor = useEditor({
    extensions: createEditorExtensions(note.body, slashMenuController),
    editable: !inTrash,
    editorProps: {
      handlePaste: (_view, event) => attachments.takeFiles(Array.from(event.clipboardData?.files ?? [])) || takeMarkdown(event.clipboardData),
      handleDrop: (_view, event) => attachments.takeFiles(Array.from((event as DragEvent).dataTransfer?.files ?? [])),
    },
  }, [noteId]);
  attachments.editor.current = editor;
  // AI のチャットに、いま開いているメモのエディタを知らせる（選択範囲を読み、答えを入れる先になる）。
  const aiChat = useAiChatSession();
  const { setActiveNote } = aiChat;
  const noteTitle = note.content.title;
  useEffect(() => {
    setActiveNote(editor ? { editor, noteId, noteTitle } : null);
    return () => setActiveNote(null);
  }, [editor, noteId, noteTitle, setActiveNote]);
  editorOfPaste.current = editor;
  // ブロックを指すリンクから開いたときは、そのブロックまで送る。
  useEffect(() => {
    if (editor && blockToReveal?.noteId === noteId) {
      revealBlock(editor, blockToReveal.blockId);
    }
  }, [editor, noteId, blockToReveal]);

  const exportNote = useNoteFileExport(repository);
  // リンク先や結合の相手に選べるメモ（ゴミ箱の外で、いま開いているメモ以外）。
  const otherNotes = () => repository.notes().filter((candidate) => candidate.id !== noteId && candidate.content.trashedAt === null);
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

  const insertNoteLink = (linkedNoteId: string, linkedBlockId: string | null = null) => {
    setPickingNoteLink(false);
    editor?.chain().focus().insertContent({ type: NOTE_LINK_NODE, attrs: { noteId: linkedNoteId, blockId: linkedBlockId } }).run();
  };
  const askLink = () => dialogs.prompt({ message: translate("editor.linkPrompt"), initialValue: "https://" });
  const { pickImage, pickFile } = attachments;
  const pickNoteLink = () => setPickingNoteLink(true);
  const pickBlockLink = () => setPickingBlockFor("link");
  const pickBlockEmbed = () => setPickingBlockFor("embed");
  const insertPickedBlock = (picked: { noteId: string; blockId: string }) => {
    setPickingBlockFor(null);
    if (pickingBlockFor === "link") {
      insertNoteLink(picked.noteId, picked.blockId);
    } else {
      editor?.chain().focus().insertContent({ type: BLOCK_EMBED_NODE, attrs: picked }).run();
    }
  };
  const toolbarActions = {
    onPickImage: pickImage, onPickFile: pickFile, onAskLink: askLink, onPickNoteLink: pickNoteLink,
    // スマホでは、カメラを開いてその場で撮れる。
    onCapturePhoto: isMobile ? attachments.capturePhoto : undefined,
    onToggleRecording: isAudioRecordingAvailable() ? audioRecorder.toggle : undefined,
    recording: audioRecorder.recording,
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
  slashMenuController.actions = { pickImage, pickFile, pickNoteLink, pickBlockLink, pickBlockEmbed, templates, insertTemplate };

  const actionError = attachments.errorMessage ?? audioRecorder.errorMessage ?? pasteMarkdown.errorMessage ?? exportNote.errorMessage ?? print.errorMessage;
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
            <NoteCharacterCount editor={editor} />
            <span className="updated">{translate("editor.updatedAt", { time: formatDateTime(note.updatedAt) })}</span>
          </div>
          {/* 作ったばかりの空のメモは、すぐ打てるようにタイトルにカーソルを置く。 */}
          <input ref={titleInput} className="title-input" value={title} placeholder={translate("editor.titlePlaceholder")} readOnly={inTrash}
            autoFocus={note.content.title === "" && bodyPlainText(note.body) === "" && note.content.attachments.length === 0}
            onChange={(event) => { setTitle(event.target.value); void repository.updateNote(noteId, { title: event.target.value }); }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !isImeKeyEvent(event.nativeEvent)) {
                event.preventDefault();
                // focus コマンドは次の描画まで待つので、続けて打った文字がタイトルに入る。
                // その場で本文へ移す。
                editor.view.focus();
                editor.commands.setTextSelection(1);
              }
            }} />
          <NoteProperties note={note} properties={propertiesOfNote(note, notebooks)} repository={repository} readOnly={inTrash} />
          <EditorContent editor={editor} />
          <NoteFootnotes editor={editor} />
          <NoteBacklinks backlinks={backlinks} onOpenNote={openNote} />
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
        <NotePicker title={translate("editor.noteLinkPickerTitle")} candidates={otherNotes()}
          onPick={(pickedNoteId) => insertNoteLink(pickedNoteId)} onCancel={() => setPickingNoteLink(false)} />
      )}
      {pickingBlockFor !== null && (
        <BlockPicker notes={repository.notes().filter((candidate) => candidate.content.trashedAt === null)}
          onPick={insertPickedBlock} onCancel={() => setPickingBlockFor(null)} />
      )}
      {pickingNoteToMerge && (
        <NotePicker title={translate("editor.mergeNotePickerTitle")} description={translate("editor.mergeNotePickerDescription")} candidates={otherNotes()}
          onPick={(pickedNoteId) => { setPickingNoteToMerge(false); void repository.mergeNoteInto(noteId, pickedNoteId); }}
          onCancel={() => setPickingNoteToMerge(false)} />
      )}
      {menuAnchor && (
        <NoteActionsMenu anchor={menuAnchor} note={note} notebooks={notebooks} repository={repository}
          onFind={() => setFindBarOpen(true)}
          onPrint={() => void print.run(undefined)}
          onDuplicate={async () => openNote((await repository.duplicateNote(noteId, translate("editor.duplicateTitle", { title: note.content.title || translate("sidebar.untitled") }))).id)}
          onMergeNote={() => setPickingNoteToMerge(true)}
          onOpenAiAssistant={() => aiChat.setOpen(true)}
          onShowHistory={() => setShowingHistory(true)} onExport={(format) => void exportNote.run({ notes: [note], format })} onClose={() => setMenuAnchor(null)} />
      )}
      {showingHistory && (
        <NoteHistoryDialog note={note} repository={repository} onClose={() => setShowingHistory(false)}
          onRestored={(restoredNoteId) => { setShowingHistory(false); openNote(restoredNoteId); }} />
      )}
    </>
  );
}
