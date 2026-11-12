// AI とのチャット。会話を続けられ、発言には文脈として、開いているメモ・選択範囲・「@」で指定したメモを添えられる。
// 答えは、コピーするか、開いているメモのカーソルの位置か末尾に入れられる。

import { FileText, TextSelect, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { LiveNote } from "../../core/notes/noteRecords";
import type { NoteRepository } from "../../core/notes/noteRepository";
import type { AiSettings } from "../../core/vault/aiSettings";
import { insertPastedMarkdown } from "../editor/pastedMarkdown";
import { describeError } from "../i18n/describeError";
import { translate } from "../i18n/translate";
import { appendMarkdownToBody } from "../markdown/appendMarkdown";
import { ATTACHMENT_HREF_PREFIX, bodyToMarkdown } from "../markdown/markdownDocument";
import { type ActiveNoteEditor, useAiChatSession } from "./aiChatSession";
import { AI_QUICK_REQUESTS, type AiAttachment, type AiChatMessage, type AiConversation, type AiQuickRequest, conversationForApi } from "./aiConversation";
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
  return settings.provider === "claude"
    ? streamClaudeCompletion({ ...settings.claude, ...input })
    : streamOpenAiCompatibleCompletion({ ...settings.openAiCompatible, ...input });
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
  const { messages, setMessages, activeNote } = useAiChatSession();
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
  const noteAttachment = (note: LiveNote): AiAttachment => ({ kind: "note", noteId: note.id, title: note.content.title, markdown: markdownOf(note) });
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
    try {
      await streamCompletion(settings, {
        conversation: conversationForApi(history),
        // 届いた文字を、最後の発言（AI の答え）の末尾に足す。
        onText: (received) => setMessages((current) => current.map((message, index) => (index === current.length - 1 && message.role === "assistant" ? { ...message, text: message.text + received } : message))),
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
        <ChatHeader running={false} hasMessages={false} onClear={() => undefined} onStop={() => undefined} onClose={onClose} />
        <p className="ai-chat-notice">{translate("ai.notEnabled")}</p>
      </section>
    );
  }
  return (
    <section className="ai-chat" aria-label={translate("ai.chat")}>
      <ChatHeader running={running} hasMessages={messages.length > 0} onClear={() => setMessages(() => [])} onStop={() => request.current?.abort()} onClose={onClose} />
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
        <div className="form-actions">
          {openNote && (Object.keys(AI_QUICK_REQUESTS) as AiQuickRequest[]).map((quickRequest) => (
            <button key={quickRequest} type="button" className="secondary-button" disabled={running} onClick={() => sendQuickRequest(quickRequest)}>
              {translate(`ai.task.${quickRequest}`)}
            </button>
          ))}
          <button type="button" className="primary-button" disabled={running || input.trim() === ""} onClick={() => void send(input, currentAttachments())}>{translate("ai.send")}</button>
        </div>
      </div>
    </section>
  );
}

type ChatHeaderProps = { running: boolean; hasMessages: boolean; onClear: () => void; onStop: () => void; onClose: () => void };

function ChatHeader({ running, hasMessages, onClear, onStop, onClose }: ChatHeaderProps) {
  return (
    <header className="ai-chat-header">
      <h2>{translate("ai.chat")}</h2>
      {running && <button type="button" className="text-button" onClick={onStop}>{translate("ai.stop")}</button>}
      {hasMessages && !running && <button type="button" className="text-button" onClick={onClear}>{translate("ai.newChat")}</button>}
      <button type="button" className="icon-button" aria-label={translate("ai.closeChat")} onClick={onClose}><X size={16} /></button>
    </header>
  );
}
