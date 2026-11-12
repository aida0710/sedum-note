// AI とのチャット。会話を続けられ、発言には文脈として、開いているメモ・選択範囲・「@」で指定したメモを添えられる。
// 答えは、コピーするか、開いているメモのカーソルの位置か末尾に入れられる。

import { ArrowUp, FileText, History, Square, TextSelect, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { LiveNote } from "../../core/notes/noteRecords";
import type { NoteRepository } from "../../core/notes/noteRepository";
import type { AiSettings } from "../../core/vault/aiSettings";
import { insertPastedMarkdown } from "../editor/pastedMarkdown";
import { describeError } from "../i18n/describeError";
import { translate } from "../i18n/translate";
import { formatDateTime } from "../shared/formatTime";
import { appendMarkdownToBody } from "../markdown/appendMarkdown";
import { ATTACHMENT_HREF_PREFIX, bodyToMarkdown } from "../markdown/markdownDocument";
import { type ActiveNoteEditor, type SavedChat, useAiChatSession } from "./aiChatSession";
import { AI_QUICK_REQUESTS, type AiAttachment, type AiChatMessage, type AiConversation, type AiQuickRequest, conversationForApi, type ReadNoteForAi } from "./aiConversation";
import { AiModelSelect } from "./AiModelSelect";
import { useAiSettings } from "./aiSettingsAccess";
import { streamClaudeCompletion } from "./claudeCompletion";
import { NoteMentionInput } from "./NoteMentionInput";
import { streamOpenAiCompatibleCompletion } from "./openAiCompatibleCompletion";

type AiChatProps = {
  repository: NoteRepository;
  // 「@」で指定できるメモ（ゴミ箱の外）。
  notes: LiveNote[];
  onClose: () => void;
};

function streamCompletion(settings: AiSettings, input: { conversation: AiConversation; onText: (text: string) => void; signal: AbortSignal }): Promise<void> {
  if (settings.provider === "claude") {
    const { apiKey, model, models } = settings.claude;
    const maxOutputTokens = models.find((option) => option.id === model)?.maxOutputTokens ?? null;
    return streamClaudeCompletion({ apiKey, model, maxOutputTokens, ...input });
  }
  const { baseUrl, apiKey, model } = settings.openAiCompatible;
  return streamOpenAiCompatibleCompletion({ baseUrl, apiKey, model, ...input });
}

// 開いているメモで選択している文字。選択していなければ空の文字。選択や本文が変わるたびに読み直す。
function useSelectedText(activeNote: ActiveNoteEditor | null): string {
  const [selectedText, setSelectedText] = useState("");
  const editor = activeNote?.editor ?? null;
  useEffect(() => {
    if (!editor) {
      setSelectedText("");
      return undefined;
    }
    const readSelection = () => {
      const { doc, selection } = editor.state;
      setSelectedText(selection.empty ? "" : doc.textBetween(selection.from, selection.to, "\n"));
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

export function AiChat({ repository, notes, onClose }: AiChatProps) {
  const { settings } = useAiSettings();
  const { messages, setMessages, activeNote, savedChats, saveChat, startNewChat, openSavedChat, deleteSavedChat } = useAiChatSession();
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
  const selectedText = useSelectedText(activeNote);
  // チャットを閉じたら、途中の依頼を止める。
  useEffect(() => () => request.current?.abort(), []);
  // 新しい発言や答えの続きが届いたら、いちばん下が見えるようにする。
  useEffect(() => {
    conversationEnd.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  const markdownOf = (note: LiveNote) => bodyToMarkdown(note.body, {
    // AI には、添付の中身は渡さない（添付は ID を指すリンクのまま渡る）。
    attachmentHref: ({ id }) => ATTACHMENT_HREF_PREFIX + id,
    noteTitle: (linkedNoteId) => repository.note(linkedNoteId)?.content.title ?? null,
  });
  const noteAttachment = (note: LiveNote): AiAttachment => ({ kind: "note", noteId: note.id, title: note.content.title });
  const readNote: ReadNoteForAi = (noteId) => {
    const note = repository.note(noteId);
    return note ? { title: note.content.title, markdown: markdownOf(note) } : null;
  };
  const openNote = activeNote ? repository.note(activeNote.noteId) : undefined;
  const mentionedNotes = mentionedNoteIds.map((noteId) => repository.note(noteId)).filter((note) => note !== undefined);

  const send = async (text: string, attachments: AiAttachment[], quickRequest?: AiQuickRequest) => {
    if (!settings || running || text.trim() === "") {
      return;
    }
    const history: AiChatMessage[] = [...messages, { role: "user", text: text.trim(), attachments, quickRequest }];
    setMessages(() => [...history, { role: "assistant", text: "" }]);
    setInput("");
    setMentionedNoteIds([]);
    setErrorMessage(null);
    setRunning(true);
    const controller = new AbortController();
    request.current = controller;
    let answer = "";
    try {
      await streamCompletion(settings, {
        conversation: conversationForApi(history, readNote),
        // 届いた文字を、最後の発言（AI の答え）の末尾に足す。
        onText: (received) => {
          answer += received;
          setMessages((current) => current.map((message, index) => (index === current.length - 1 && message.role === "assistant" ? { ...message, text: message.text + received } : message)));
        },
        signal: controller.signal,
      });
    } catch (error) {
      if (!controller.signal.aborted) {
        setErrorMessage(describeError(error));
      }
    } finally {
      setRunning(false);
      // 答えが 1 文字も届かなかったとき（失敗、すぐ止めた）は、空の答えを会話に残さない。
      setMessages((current) => (current[current.length - 1]?.role === "assistant" && current[current.length - 1]?.text === "" ? current.slice(0, -1) : current));
      // 答えが届かなかった回も、利用者の発言は残す（あとで同じ依頼を送り直せる）。
      void saveChat(answer === "" ? history : [...history, { role: "assistant", text: answer }]);
    }
  };
  const currentAttachments = (): AiAttachment[] => [
    ...(includesOpenNote && openNote && !mentionedNoteIds.includes(openNote.id) ? [noteAttachment(openNote)] : []),
    ...mentionedNotes.map(noteAttachment),
    ...(includesSelection && selectedText !== "" && activeNote ? [{ kind: "selection" as const, noteTitle: activeNote.noteTitle, text: selectedText }] : []),
  ];
  const sendQuickRequest = (quickRequest: AiQuickRequest) => {
    if (openNote) {
      void send(translate(`ai.task.${quickRequest}`), [noteAttachment(openNote)], quickRequest);
    }
  };
  const importContext = { noteExists: (noteId: string) => repository.note(noteId) !== undefined };

  if (settings?.enabled !== true) {
    return (
      <section className="ai-chat" aria-label={translate("ai.chat")}>
        <ChatHeader showsModel={false} canStartNewChat={false} onStartNewChat={() => undefined} showsHistory={null} onToggleHistory={() => undefined} onClose={onClose} />
        <p className="ai-chat-notice">{translate("ai.notEnabled")}</p>
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
            <div className="ai-message-text">{message.text || translate("ai.waiting")}</div>
            {message.role === "assistant" && message.text !== "" && !(running && index === messages.length - 1) && (
              <div className="ai-message-actions">
                <button type="button" className="text-button" onClick={() => void navigator.clipboard.writeText(message.text)}>{translate("ai.copy")}</button>
                {activeNote?.editor.isEditable && (
                  <>
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

type SavedChatListProps = { chats: SavedChat[]; disabled: boolean; onOpen: (chatId: string) => void; onDelete: (chatId: string) => void };

// 残した会話の一覧。押すと、その会話を開いて続きを話せる。
function SavedChatList({ chats, disabled, onOpen, onDelete }: SavedChatListProps) {
  return (
    <div className="ai-chat-messages" role="list" aria-label={translate("ai.history")}>
      {chats.length === 0 && <p className="ai-chat-notice">{translate("ai.historyEmpty")}</p>}
      {chats.map((chat) => {
        const title = chat.title || translate("ai.untitledChat");
        return (
          <div key={chat.id} role="listitem" className="ai-saved-chat">
            <button type="button" className="ai-saved-chat-open" disabled={disabled} onClick={() => onOpen(chat.id)}>
              <span className="ai-saved-chat-title">{title}</span>
              <span className="ai-saved-chat-time">{formatDateTime(chat.updatedAt)}</span>
            </button>
            <button type="button" className="icon-button" disabled={disabled} aria-label={translate("ai.deleteChat", { title })} onClick={() => onDelete(chat.id)}>
              <Trash2 size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
