// AI とのチャット。会話を続けられ、発言には文脈として、開いているメモ・選択範囲・「@」で指定したメモを添えられる。
// 答えは、コピーするか、開いているメモのカーソルの位置か末尾に入れられる。開いているメモの直しを頼むと、AI は直しの案を
// 出し（道具の呼び出し）、差分を見て適用するかを選べる。

import { ArrowUp, FileText, History, Square, TextSelect, X } from "lucide-react";
import type { JSONContent } from "@tiptap/core";
import { useEffect, useRef, useState } from "react";
import type { LiveNote } from "../../core/notes/noteRecords";
import type { NoteRepository } from "../../core/notes/noteRepository";
import type { AiSettings } from "../../core/vault/aiSettings";
import { insertPastedMarkdown } from "../editor/pastedMarkdown";
import { describeError } from "../i18n/describeError";
import { translate } from "../i18n/translate";
import { UserFacingError } from "../i18n/userFacingError";
import { appendMarkdownToBody } from "../markdown/appendMarkdown";
import { bodyToMarkdown } from "../markdown/markdownDocument";
import { markdownExportContextOf, markdownImportContextOf } from "../markdown/repositoryMarkdownContext";
import { type ActiveNoteEditor, useAiChatSession } from "./aiChatSession";
import { isReplaceableSelection, replaceSelectedText } from "./selectionReplacement";
import { AI_QUICK_REQUESTS, type AiAttachment, type AiChatMessage, type AiConversation, type AiNoteEdit, type AiQuickRequest, conversationForApi, type ReadNoteForAi, withEditStatus } from "./aiConversation";
import { AiModelSelect } from "./AiModelSelect";
import { useAiSettings } from "./aiSettingsAccess";
import { streamClaudeCompletion } from "./claudeCompletion";
import { NoteEditCard } from "./NoteEditCard";
import { applyProposalToOpenNote, canApplyProposalTo } from "./noteEditActions";
import { createNoteEditProposal } from "./noteEditProposal";
import { type AiToolCall, noteEditInputOf } from "./noteEditTool";
import { NoteMentionInput } from "./NoteMentionInput";
import { streamOpenAiCompatibleCompletion } from "./openAiCompatibleCompletion";
import { SavedChatList } from "./SavedChatList";

// 直しの案を出させるメモと、頼んだときの本文（案と比べる元）。
type EditTarget = { noteId: string; baseDocument: JSONContent };

type AiChatProps = {
  repository: NoteRepository;
  // 「@」で指定できるメモ（ゴミ箱の外）。
  notes: LiveNote[];
  onClose: () => void;
  // 設定の「AI」のページを開く。まだ有効にしていないときの案内から使う。
  onOpenAiSettings: () => void;
};

function streamCompletion(settings: AiSettings, input: { conversation: AiConversation; onText: (text: string) => void; signal: AbortSignal }): Promise<AiToolCall | null> {
  if (settings.provider === "claude") {
    const { apiKey, model, models } = settings.claude;
    const maxOutputTokens = models.find((option) => option.id === model)?.maxOutputTokens ?? null;
    return streamClaudeCompletion({ apiKey, model, maxOutputTokens, ...input });
  }
  const { baseUrl, apiKey, model } = settings.openAiCompatible;
  return streamOpenAiCompatibleCompletion({ baseUrl, apiKey, model, ...input });
}

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

export function AiChat({ repository, notes, onClose, onOpenAiSettings }: AiChatProps) {
  const { settings, saveSettings } = useAiSettings();
  const { messages, setMessages, activeNote, savedChats, saveChat, startNewChat, openSavedChat, deleteSavedChat, editProposals, rememberEditProposal, pendingRequest, setPendingRequest } = useAiChatSession();
  // 適用している直しの案の、道具の呼び出しの ID。
  const [applyingEditId, setApplyingEditId] = useState<string | null>(null);
  // true なら、会話の代わりに、残した会話の一覧を出す。
  const [showsHistory, setShowsHistory] = useState(false);
  const [input, setInput] = useState("");
  // 開いているメモを文脈に足すか。選択範囲は、選択している間だけ足す（外すこともできる）。
  const [includesOpenNote, setIncludesOpenNote] = useState(true);
  const [includesSelection, setIncludesSelection] = useState(true);
  const [mentionedNoteIds, setMentionedNoteIds] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const request = useRef<AbortController | null>(null);
  const conversationEnd = useRef<HTMLDivElement>(null);
  const selection = useSelectedText(activeNote);
  const selectedText = selection.text;
  // チャットを閉じたら、途中の依頼を止める。
  useEffect(() => () => request.current?.abort(), []);
  // 新しい発言や答えの続きが届いたら、いちばん下が見えるようにする。
  useEffect(() => {
    conversationEnd.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  // AI には、添付の中身は渡さない（添付は ID を指すリンクのまま渡る）。
  const exportContext = markdownExportContextOf(repository);
  const markdownOf = (note: LiveNote) => bodyToMarkdown(note.body, exportContext);
  const noteAttachment = (note: LiveNote, isOpenNote = false): AiAttachment => ({ kind: "note", noteId: note.id, title: note.content.title, isOpenNote });
  const readNote: ReadNoteForAi = (noteId) => {
    const note = repository.note(noteId);
    return note ? { title: note.content.title, markdown: markdownOf(note) } : null;
  };
  const openNote = activeNote ? repository.note(activeNote.noteId) : undefined;
  const mentionedNotes = mentionedNoteIds.map((noteId) => repository.note(noteId)).filter((note) => note !== undefined);

  // 答えに入っていた道具の呼び出しから、直しの案を作る。案を作れなければ null（入力が途中で切れた、など）。
  const editOfToolCall = async (toolCall: AiToolCall, target: EditTarget | null): Promise<AiNoteEdit | null> => {
    const editInput = noteEditInputOf(toolCall);
    if (!editInput) {
      throw new UserFacingError(translate("ai.edit.unreadable"));
    }
    if (!target) {
      // 開いているメモを添えていない回の呼び出しは、比べる元が無いので使えない。
      return { toolCallId: toolCall.id, noteId: "", summary: editInput.summary, status: "stale" };
    }
    const proposal = await createNoteEditProposal({
      noteId: target.noteId, summary: editInput.summary, markdown: editInput.markdown, baseDocument: target.baseDocument,
      exportContext, importContext: markdownImportContextOf(repository),
    });
    rememberEditProposal(toolCall.id, proposal);
    if (settings?.autoApplyEdits) {
      return { toolCallId: toolCall.id, noteId: target.noteId, summary: editInput.summary, status: await applyProposalToOpenNote({ repository, activeNote, proposal }) };
    }
    return { toolCallId: toolCall.id, noteId: target.noteId, summary: editInput.summary, status: "proposed" };
  };

  const send = async (text: string, attachments: AiAttachment[], quickRequest?: AiQuickRequest) => {
    if (!settings || running || text.trim() === "") {
      return;
    }
    const history: AiChatMessage[] = [...messages, { role: "user", text: text.trim(), attachments, quickRequest }];
    // 開いているメモを添え、書き換えられるときだけ、直しの案を出す道具を渡す。比べる元として、今の本文を控える。
    const target: EditTarget | null = activeNote?.editor.isEditable && attachments.some((attachment) => attachment.kind === "note" && attachment.isOpenNote)
      ? { noteId: activeNote.noteId, baseDocument: activeNote.editor.getJSON() }
      : null;
    setMessages(() => [...history, { role: "assistant", text: "" }]);
    setInput("");
    setMentionedNoteIds([]);
    setErrorMessage(null);
    setRunning(true);
    const controller = new AbortController();
    request.current = controller;
    let answer = "";
    let edit: AiNoteEdit | null = null;
    try {
      const toolCall = await streamCompletion(settings, {
        conversation: conversationForApi(history, readNote, { offersNoteEdit: target !== null }),
        // 届いた文字を、最後の発言（AI の答え）の末尾に足す。
        onText: (received) => {
          answer += received;
          setMessages((current) => current.map((message, index) => (index === current.length - 1 && message.role === "assistant" ? { ...message, text: message.text + received } : message)));
        },
        signal: controller.signal,
      });
      edit = toolCall ? await editOfToolCall(toolCall, target) : null;
    } catch (error) {
      if (!controller.signal.aborted) {
        setErrorMessage(describeError(error));
      }
    } finally {
      setRunning(false);
    }
    // 答えが何も届かなかったとき（失敗、すぐ止めた）は、空の答えを会話に残さない。利用者の発言は残す（あとで送り直せる）。
    const answered: AiChatMessage[] = answer === "" && !edit ? history : [...history, { role: "assistant", text: answer, ...(edit ? { edit } : {}) }];
    setMessages(() => answered);
    void saveChat(answered);
  };
  const decideEdit = async (toolCallId: string, decision: "apply" | "reject") => {
    const proposal = editProposals.get(toolCallId);
    if (!proposal) {
      return;
    }
    setApplyingEditId(toolCallId);
    try {
      const status = decision === "reject" ? "rejected" : await applyProposalToOpenNote({ repository, activeNote, proposal });
      const decided = withEditStatus(messages, toolCallId, status);
      setMessages(() => decided);
      void saveChat(decided);
    } catch (error) {
      setErrorMessage(describeError(error));
    } finally {
      setApplyingEditId(null);
    }
  };
  const currentAttachments = (): AiAttachment[] => [
    ...(includesOpenNote && openNote && !mentionedNoteIds.includes(openNote.id) ? [noteAttachment(openNote, true)] : []),
    ...mentionedNotes.map((note) => noteAttachment(note)),
    ...(includesSelection && selectedText !== "" && activeNote
      ? [{ kind: "selection" as const, noteTitle: activeNote.noteTitle, text: selectedText, noteId: activeNote.noteId, from: selection.from, to: selection.to }]
      : []),
  ];
  // 本文で選んだ所の上のボタンから頼まれた依頼は、つなぎ先の設定を読み終えたら送る。AI を有効にしていなければ、送らずに捨てる
  // （有効にしてから、あとで思いがけず送られないように）。
  useEffect(() => {
    if (!pendingRequest || settings === null || running) {
      return;
    }
    setPendingRequest(null);
    if (settings.enabled) {
      void send(pendingRequest.text, pendingRequest.attachments, pendingRequest.quickRequest);
    }
  });
  // 答えで、頼んだときに選んでいた所を入れ替える。その所が変わっていたら、入れ替えずに知らせる。
  const replaceSelection = async (answer: string, selectionAttachment: Parameters<typeof replaceSelectedText>[1]) => {
    if (!activeNote) {
      return;
    }
    const replaced = await replaceSelectedText(activeNote.editor, selectionAttachment, answer, importContext);
    setErrorMessage(replaced ? null : translate("ai.selectionChanged"));
  };
  // 答えのすぐ前の発言に添えた、入れ替えられる選択範囲（開いているメモのもの）。
  const replaceableSelectionBefore = (index: number) => {
    const question = messages[index - 1];
    return question?.role === "user" && activeNote
      ? question.attachments.find((attachment) => isReplaceableSelection(attachment, activeNote.noteId)) ?? null
      : null;
  };
  const sendQuickRequest = (quickRequest: AiQuickRequest) => {
    if (openNote) {
      void send(translate(`ai.task.${quickRequest}`), [noteAttachment(openNote, true)], quickRequest);
    }
  };
  const importContext = { noteExists: (noteId: string) => repository.note(noteId) !== undefined };

  if (settings?.enabled !== true) {
    return (
      <section className="ai-chat" aria-label={translate("ai.chat")}>
        <ChatHeader showsModel={false} canStartNewChat={false} onStartNewChat={() => undefined} showsHistory={null} onToggleHistory={() => undefined} onClose={onClose} />
        <div className="ai-chat-notice">
          <p>{translate("ai.notEnabled")}</p>
          <button type="button" className="primary-button" onClick={onOpenAiSettings}>{translate("ai.openSettings")}</button>
        </div>
      </section>
    );
  }
  return (
    <section className="ai-chat" aria-label={translate("ai.chat")}>
      <ChatHeader showsModel canStartNewChat={messages.length > 0 && !running && !showsHistory} onStartNewChat={startNewChat}
        showsHistory={showsHistory} onToggleHistory={() => setShowsHistory(!showsHistory)} onClose={onClose} />
      {showsHistory ? (
        <SavedChatList chats={savedChats ?? []} disabled={running}
          onOpen={(chatId) => {
            openSavedChat(chatId);
            setErrorMessage(null);
            setShowsHistory(false);
          }}
          onDelete={(chatId) => void deleteSavedChat(chatId)} />
      ) : (
      <>
      <div className="ai-chat-messages">
        {messages.length === 0 && <p className="ai-chat-notice">{translate("ai.chatDescription")}</p>}
        {messages.map((message, index) => (
          <div key={index} className={`ai-message ${message.role}`}>
            {message.role === "user" && message.attachments.length > 0 && (
              <div className="ai-context">
                {message.attachments.map((attachment, attachmentIndex) => (
                  <span key={attachmentIndex} className="chip">
                    {attachment.kind === "note" ? <FileText size={12} /> : <TextSelect size={12} />}
                    {attachment.kind === "note" ? attachment.title || translate("sidebar.untitled") : translate("ai.selectionChip", { count: attachment.text.length })}
                  </span>
                ))}
              </div>
            )}
            {(message.text !== "" || message.role === "user" || !message.edit) && <div className="ai-message-text">{message.text || translate("ai.waiting")}</div>}
            {message.role === "assistant" && message.edit && (
              <NoteEditCard edit={message.edit} proposal={editProposals.get(message.edit.toolCallId) ?? null}
                canApply={canApplyProposalTo(activeNote, message.edit.noteId)} busy={applyingEditId !== null}
                onApply={() => void decideEdit(message.edit!.toolCallId, "apply")} onReject={() => void decideEdit(message.edit!.toolCallId, "reject")} />
            )}
            {message.role === "assistant" && message.text !== "" && !(running && index === messages.length - 1) && (
              <div className="ai-message-actions">
                <button type="button" className="text-button" onClick={() => void navigator.clipboard.writeText(message.text)}>{translate("ai.copy")}</button>
                {activeNote?.editor.isEditable && (
                  <>
                    {(() => {
                      const selectionAttachment = replaceableSelectionBefore(index);
                      return selectionAttachment && isReplaceableSelection(selectionAttachment, activeNote.noteId) && (
                        <button type="button" className="text-button" onClick={() => void replaceSelection(message.text, selectionAttachment)}>{translate("ai.replaceSelection")}</button>
                      );
                    })()}
                    <button type="button" className="text-button" onClick={() => void insertPastedMarkdown(activeNote.editor, message.text, importContext)}>{translate("ai.insertAtCursor")}</button>
                    <button type="button" className="text-button" onClick={() => void appendMarkdownToBody(message.text, repository.note(activeNote.noteId)!.body, { ...importContext, attachFile: async () => null })}>
                      {translate("ai.append")}
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        ))}
        {errorMessage && <div className="form-error" role="alert">{errorMessage}</div>}
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
              <button type="button" aria-label={translate("ai.removeMention", { title: note.content.title })} onClick={() => setMentionedNoteIds(mentionedNoteIds.filter((noteId) => noteId !== note.id))}>
                <X size={11} />
              </button>
            </span>
          ))}
        </div>
        <NoteMentionInput value={input} onChange={setInput} disabled={running} onSubmit={() => void send(input, currentAttachments())}
          notes={notes.filter((note) => !mentionedNoteIds.includes(note.id))}
          onMention={(note) => setMentionedNoteIds([...mentionedNoteIds, note.id])} />
        <label className="checkbox-line ai-auto-apply">
          <input type="checkbox" checked={settings.autoApplyEdits} onChange={(event) => void saveSettings({ ...settings, autoApplyEdits: event.target.checked })} />
          {translate("ai.edit.autoApply")}
        </label>
        <div className="ai-composer-actions">
          {openNote && (Object.keys(AI_QUICK_REQUESTS) as AiQuickRequest[]).map((quickRequest) => (
            <button key={quickRequest} type="button" className="secondary-button" disabled={running} onClick={() => sendQuickRequest(quickRequest)}>
              {translate(`ai.task.${quickRequest}`)}
            </button>
          ))}
          {/* 答えを受け取っている間は、送るボタンが止めるボタンに変わる（Claude や ChatGPT と同じ置き場所）。 */}
          {running ? (
            <button type="button" className="ai-send-button" aria-label={translate("ai.stop")} title={translate("ai.stop")} onClick={() => request.current?.abort()}>
              <Square size={13} fill="currentColor" />
            </button>
          ) : (
            <button type="button" className="ai-send-button" aria-label={translate("ai.send")} title={translate("ai.send")} disabled={input.trim() === ""} onClick={() => void send(input, currentAttachments())}>
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
  showsModel: boolean;
  canStartNewChat: boolean;
  onStartNewChat: () => void;
  // 残した会話の一覧を出しているか。一覧のボタンを出さないときは null。
  showsHistory: boolean | null;
  onToggleHistory: () => void;
  onClose: () => void;
};

function ChatHeader({ showsModel, canStartNewChat, onStartNewChat, showsHistory, onToggleHistory, onClose }: ChatHeaderProps) {
  return (
    <header className="ai-chat-header">
      <h2>{translate("ai.chat")}</h2>
      {showsModel && <AiModelSelect id="ai-chat-model" compact />}
      {canStartNewChat && <button type="button" className="text-button" onClick={onStartNewChat}>{translate("ai.newChat")}</button>}
      {showsHistory !== null && (
        <button type="button" className={`icon-button${showsHistory ? " active" : ""}`} aria-label={translate("ai.history")} aria-pressed={showsHistory} title={translate("ai.history")} onClick={onToggleHistory}>
          <History size={16} />
        </button>
      )}
      <button type="button" className="icon-button" aria-label={translate("ai.closeChat")} onClick={onClose}><X size={16} /></button>
    </header>
  );
}
