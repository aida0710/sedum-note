// AI とのチャット。会話を続けられ、発言には文脈として、開いているメモ・選択範囲・「@」で指定したメモを添えられる。
// AI はツールでメモを探し、読み、作り、直せる（許可は設定の「AI」のページで種類ごとに選ぶ）。聞く設定の変更は、
// 答えの下のカードで承認してから行う。チャットの上のモデルと、承認を待つかの切り替えは、その会話だけに効く（設定は変えない）。
// 答えは、コピーするか、開いているメモのカーソルの位置か末尾に入れられる。
// 発言を進める状態は AiChatSessionProvider が持つので、この欄を閉じても止まらない。

import { ArrowUp, FileText, History, Square, SquarePen, TextSelect, X } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import type { LiveNote } from "../../core/notes/noteRecords";
import type { NoteRepository } from "../../core/notes/noteRepository";
import { insertPastedMarkdown } from "../editor/pastedMarkdown";
import { translate } from "../i18n/translate";
import { appendMarkdownToBody } from "../markdown/appendMarkdown";
import { useDialogs } from "../shared/DialogProvider";
import { isMenuOpen } from "../shared/escapeOwners";
import { isImeKeyEvent } from "../shared/imeKeyEvent";
import { AiApprovalCard } from "./AiApprovalCard";
import { type ActiveNoteEditor, type SavedChat, useAiChatSession } from "./aiChatSession";
import { AiChatMessageView, type AnswerActions } from "./AiChatMessageView";
import { AI_QUICK_REQUESTS, type AiAttachment, type AiQuickRequest } from "./aiConversation";
import { AiModelSelect } from "./AiModelSelect";
import { NoteMentionInput } from "./NoteMentionInput";
import { SavedChatList } from "./SavedChatList";
import { isReplaceableSelection, replaceSelectedText } from "./selectionReplacement";

type AiChatProps = {
  repository: NoteRepository;
  // 「@」で指定できるメモ（ゴミ箱の外）。
  notes: LiveNote[];
  onClose: () => void;
  // 設定の「AI」のページを開く。まだ有効にしていないときの案内から使う。
  onOpenAiSettings: () => void;
  // AI が読んだ・作った・直したメモを開く（ツールの行を押したとき）。
  onOpenNote: (noteId: string) => void;
  // PC の右の欄として出しているか。右の欄では、開いたら入力欄にフォーカスを移し、Esc で閉じる
  //（スマホではダイアログの中に出すので、フォーカスと Esc はダイアログに任せる）。
  isSidePanel?: boolean;
};

// 開いているメモで選択している文字と、その範囲。選択していなければ text は空の文字。選択や本文が変わるたびに読み直す。
type SelectedText = { text: string; from: number; to: number };
const NO_SELECTED_TEXT: SelectedText = { text: "", from: 0, to: 0 };

function useSelectedText(activeNote: ActiveNoteEditor | null): SelectedText {
  const [selectedText, setSelectedText] = useState(NO_SELECTED_TEXT);
  const editor = activeNote?.editor ?? null;
  useEffect(() => {
    if (!editor) {
      setSelectedText(NO_SELECTED_TEXT);
      return undefined;
    }
    const readSelection = () => {
      const { doc, selection } = editor.state;
      setSelectedText(selection.empty ? NO_SELECTED_TEXT : { text: doc.textBetween(selection.from, selection.to, "\n"), from: selection.from, to: selection.to });
    };
    readSelection();
    editor.on("selectionUpdate", readSelection);
    editor.on("update", readSelection);
    return () => {
      editor.off("selectionUpdate", readSelection);
      editor.off("update", readSelection);
    };
  }, [editor]);
  return selectedText;
}

export function AiChat({ repository, notes, onClose, onOpenAiSettings, onOpenNote, isSidePanel = false }: AiChatProps) {
  const {
    messages, conversationSettings: settings, setConversationOverrides, activeNote, savedChats, startNewChat, openSavedChat, deleteSavedChat,
    running, startingToolName, errorMessage, setErrorMessage, pendingApproval, send, retry, stop, draft, setDraft,
  } = useAiChatSession();
  const { text: input, mentionedNoteIds } = draft;
  // 「@」の候補を選ぶと、入力の書き換えとメモの追加が続けて呼ばれるので、どちらも今の書きかけから作る。
  const setInput = (text: string) => setDraft((current) => ({ ...current, text }));
  const removeMention = (noteId: string) => setDraft((current) => ({ ...current, mentionedNoteIds: current.mentionedNoteIds.filter((mentioned) => mentioned !== noteId) }));
  // 右の欄では、Esc で欄を閉じて、開いているメモの本文へフォーカスを戻す。「@」の候補とメニューが開いている間の Esc は、
  // そちらを閉じるのに使う（候補は NoteMentionInput が先に受けて、ここへは届かない）。
  const closeByEscape = (event: React.KeyboardEvent) => {
    if (!isSidePanel || event.key !== "Escape" || isImeKeyEvent(event.nativeEvent) || isMenuOpen()) {
      return;
    }
    onClose();
    activeNote?.editor.view.focus();
  };
  const dialogs = useDialogs();
  // true なら、会話の代わりに、残した会話の一覧を出す。
  const [showsHistory, setShowsHistory] = useState(false);
  // 開いているメモを文脈に足すか。選択範囲は、選択している間だけ足す（外すこともできる）。
  const [includesOpenNote, setIncludesOpenNote] = useState(true);
  const [includesSelection, setIncludesSelection] = useState(true);
  const conversationEnd = useRef<HTMLDivElement>(null);
  const selection = useSelectedText(activeNote);
  const selectedText = selection.text;
  // 新しい発言や答えの続き、承認のカードが届いたら、いちばん下が見えるようにする。
  useEffect(() => {
    conversationEnd.current?.scrollIntoView({ block: "end" });
  }, [messages, pendingApproval]);

  const noteAttachment = (note: LiveNote, isOpenNote = false): AiAttachment => ({ kind: "note", noteId: note.id, title: note.content.title, isOpenNote });
  const openNote = activeNote ? repository.note(activeNote.noteId) : undefined;
  const mentionedNotes = mentionedNoteIds.map((noteId) => repository.note(noteId)).filter((note) => note !== undefined);
  const importContext = { noteExists: (noteId: string) => repository.note(noteId) !== undefined };

  const sendInput = (attachments: AiAttachment[]) => {
    setDraft(() => ({ text: "", mentionedNoteIds: [] }));
    void send(input, attachments);
  };
  const currentAttachments = (): AiAttachment[] => [
    ...(includesOpenNote && openNote && !mentionedNoteIds.includes(openNote.id) ? [noteAttachment(openNote, true)] : []),
    ...mentionedNotes.map((note) => noteAttachment(note)),
    ...(includesSelection && selectedText !== "" && activeNote
      ? [{ kind: "selection" as const, noteTitle: activeNote.noteTitle, text: selectedText, noteId: activeNote.noteId, from: selection.from, to: selection.to }]
      : []),
  ];
  // 答えのすぐ前の発言に添えた、入れ替えられる選択範囲（開いているメモのもの）。
  const replaceableSelectionBefore = (index: number) => {
    const question = messages[index - 1];
    return question?.role === "user" && activeNote
      ? question.attachments.find((attachment) => isReplaceableSelection(attachment, activeNote.noteId)) ?? null
      : null;
  };
  const answerActionsAt = (index: number): AnswerActions => {
    const editor = activeNote?.editor.isEditable ? activeNote.editor : null;
    const selectionAttachment = replaceableSelectionBefore(index);
    return {
      canInsert: editor !== null,
      canReplaceSelection: editor !== null && selectionAttachment !== null,
      // 答えで、頼んだときに選んでいた所を入れ替える。その所が変わっていたら、入れ替えずに知らせる。
      onReplaceSelection: (answer) => {
        if (editor && selectionAttachment) {
          void replaceSelectedText(editor, selectionAttachment, answer, importContext).then((replaced) => setErrorMessage(replaced ? null : translate("ai.selectionChanged")));
        }
      },
      onInsertAtCursor: (answer) => {
        if (editor) {
          void insertPastedMarkdown(editor, answer, importContext);
        }
      },
      onAppend: (answer) => {
        const note = activeNote ? repository.note(activeNote.noteId) : undefined;
        if (note) {
          void appendMarkdownToBody(answer, note.body, { ...importContext, attachFile: async () => null });
        }
      },
    };
  };
  // 残した会話は手元にしか無く、消すと戻せないので、確かめてから消す。
  const deleteSavedChatAfterConfirming = async (chat: SavedChat) => {
    const title = chat.title || translate("ai.untitledChat");
    if (await dialogs.confirm({ message: translate("ai.deleteChatConfirm", { title }), confirmLabel: translate("common.delete"), danger: true })) {
      await deleteSavedChat(chat.id);
    }
  };
  const sendQuickRequest = (quickRequest: AiQuickRequest) => {
    if (openNote) {
      void send(translate(`ai.task.${quickRequest}`), [noteAttachment(openNote, true)], quickRequest);
    }
  };

  if (settings?.enabled !== true) {
    return (
      <section className="ai-chat" aria-label={translate("ai.chat")} onKeyDown={closeByEscape}>
        <ChatHeader modelSelect={null} canStartNewChat={false} onStartNewChat={() => undefined} showsHistory={null} onToggleHistory={() => undefined} onClose={onClose} />
        <div className="ai-chat-notice">
          <p>{translate("ai.notEnabled")}</p>
          <button type="button" className="primary-button" onClick={onOpenAiSettings}>{translate("ai.openSettings")}</button>
        </div>
      </section>
    );
  }
  const editsWithoutAsking = settings.permissions.edit === "allow";
  return (
    <section className="ai-chat" aria-label={translate("ai.chat")} onKeyDown={closeByEscape}>
      <ChatHeader canStartNewChat={messages.length > 0 && !running && !showsHistory} onStartNewChat={startNewChat}
        showsHistory={showsHistory} onToggleHistory={() => setShowsHistory(!showsHistory)} onClose={onClose}
        modelSelect={(
          <AiModelSelect id="ai-chat-model" compact ariaLabel={translate("ai.conversationModel")} settings={settings}
            onChoose={(id) => setConversationOverrides((overrides) => ({ ...overrides, model: { provider: settings.provider, id } }))} />
        )} />
      {showsHistory ? (
        <SavedChatList chats={savedChats ?? []} disabled={running}
          onOpen={(chatId) => {
            openSavedChat(chatId);
            setErrorMessage(null);
            setShowsHistory(false);
          }}
          onDelete={(chat) => void deleteSavedChatAfterConfirming(chat)} />
      ) : (
      <>
      <div className="ai-chat-messages">
        {messages.length === 0 && <p className="ai-chat-notice">{translate("ai.chatDescription")}</p>}
        {messages.map((message, index) => (
          <AiChatMessageView key={index} message={message} isReceiving={running && index === messages.length - 1} answerActions={answerActionsAt(index)}
            noteExists={importContext.noteExists} onOpenNote={onOpenNote} onOpenAiSettings={onOpenAiSettings} />
        ))}
        {startingToolName && <p className="hint ai-tool-starting">{translate("ai.tool.starting")}</p>}
        {pendingApproval && <AiApprovalCard key={pendingApproval.items[0]?.toolCallId} approval={pendingApproval} />}
        {errorMessage && <div className="form-error" role="alert">{errorMessage}</div>}
        {/* 送るのに失敗したとき（API キーが違う、つながらない、モデルが無い）は、直す所と、送り直す手段を添える。 */}
        {errorMessage && retry && (
          <div className="form-actions">
            <button type="button" className="secondary-button" onClick={onOpenAiSettings}>{translate("ai.openSettings")}</button>
            <button type="button" className="primary-button" onClick={retry}>{translate("ai.retry")}</button>
          </div>
        )}
        <div ref={conversationEnd} />
      </div>
      <div className="ai-chat-composer">
        <div className="ai-context" aria-label={translate("ai.context")}>
          {openNote && (
            <label className="chip toggle">
              <input type="checkbox" checked={includesOpenNote} onChange={(event) => setIncludesOpenNote(event.target.checked)} />
              <FileText size={12} />{translate("ai.openNoteChip", { title: openNote.content.title || translate("sidebar.untitled") })}
            </label>
          )}
          {selectedText !== "" && (
            <label className="chip toggle">
              <input type="checkbox" checked={includesSelection} onChange={(event) => setIncludesSelection(event.target.checked)} />
              <TextSelect size={12} />{translate("ai.selectionChip", { count: selectedText.length })}
            </label>
          )}
          {mentionedNotes.map((note) => (
            <span key={note.id} className="chip">
              <FileText size={12} />{note.content.title || translate("sidebar.untitled")}
              <button type="button" aria-label={translate("ai.removeMention", { title: note.content.title })} onClick={() => removeMention(note.id)}>
                <X size={11} />
              </button>
            </span>
          ))}
        </div>
        <NoteMentionInput value={input} onChange={setInput} disabled={running} autoFocus={isSidePanel} onSubmit={() => sendInput(currentAttachments())}
          notes={notes.filter((note) => !mentionedNoteIds.includes(note.id))}
          onMention={(note) => setDraft((current) => ({ ...current, mentionedNoteIds: [...current.mentionedNoteIds, note.id] }))} />
        {/* 「作る・直す」を、この会話だけ、聞かずに行うか毎回聞くかで切り替える（設定で許可していなければ出さない）。 */}
        {settings.permissions.edit !== "deny" && (
          <label className="checkbox-line ai-auto-apply">
            <input type="checkbox" checked={editsWithoutAsking}
              onChange={(event) => setConversationOverrides((overrides) => ({ ...overrides, editsWithoutAsking: event.target.checked }))} />
            {translate("ai.autoApplyEdits")}
          </label>
        )}
        <div className="ai-composer-actions">
          {openNote && (Object.keys(AI_QUICK_REQUESTS) as AiQuickRequest[]).map((quickRequest) => (
            <button key={quickRequest} type="button" className="secondary-button" disabled={running} onClick={() => sendQuickRequest(quickRequest)}>
              {translate(`ai.task.${quickRequest}`)}
            </button>
          ))}
          {/* 動いている間は、送るボタンが止めるボタンに変わる（Claude や ChatGPT と同じ置き場所）。 */}
          {running ? (
            <button type="button" className="ai-send-button" aria-label={translate("ai.stop")} title={translate("ai.stop")} onClick={stop}>
              <Square size={13} fill="currentColor" />
            </button>
          ) : (
            <button type="button" className="ai-send-button" aria-label={translate("ai.send")} title={translate("ai.send")} disabled={input.trim() === ""} onClick={() => sendInput(currentAttachments())}>
              <ArrowUp size={16} />
            </button>
          )}
        </div>
      </div>
      </>
      )}
    </section>
  );
}

type ChatHeaderProps = {
  // 会話で使うモデルを選ぶ欄。出さないなら null。
  modelSelect: ReactNode | null;
  canStartNewChat: boolean;
  onStartNewChat: () => void;
  // 残した会話の一覧を出しているか。一覧のボタンを出さないときは null。
  showsHistory: boolean | null;
  onToggleHistory: () => void;
  onClose: () => void;
};

function ChatHeader({ modelSelect, canStartNewChat, onStartNewChat, showsHistory, onToggleHistory, onClose }: ChatHeaderProps) {
  return (
    <header className="ai-chat-header">
      <h2>{translate("ai.chat")}</h2>
      {modelSelect}
      {/* 始められないとき（まだ何も話していない、答えを待っている）も同じ所に置き、隣の部品の位置が動かないようにする。 */}
      {showsHistory !== null && (
        <button type="button" className="icon-button" aria-label={translate("ai.newChat")} title={translate("ai.newChat")} disabled={!canStartNewChat} onClick={onStartNewChat}>
          <SquarePen size={16} />
        </button>
      )}
      {showsHistory !== null && (
        <button type="button" className={`icon-button${showsHistory ? " active" : ""}`} aria-label={translate("ai.history")} aria-pressed={showsHistory} title={translate("ai.history")} onClick={onToggleHistory}>
          <History size={16} />
        </button>
      )}
      <button type="button" className="icon-button" aria-label={translate("ai.closeChat")} onClick={onClose}><X size={16} /></button>
    </header>
  );
}
