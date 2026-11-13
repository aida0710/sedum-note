// チャットの 1 つの発言。利用者の発言は、添えた文脈と文。AI の答えは、文とツールの呼び出しの行が届いた順に並び、
// 答え終えたら、文をコピーしたり、開いているメモに入れたりするボタンを出す。

import { FileText, TextSelect } from "lucide-react";
import { translate } from "../i18n/translate";
import { type AiAttachment, type AiChatMessage, answerTextOf } from "./aiConversation";
import { AiToolActivityLine } from "./AiToolActivityLine";

const CHIP_ICON_SIZE = 12;

function AttachmentChips({ attachments }: { attachments: AiAttachment[] }) {
  return (
    <div className="ai-context">
      {attachments.map((attachment, index) => (
        <span key={index} className="chip">
          {attachment.kind === "note" ? <FileText size={CHIP_ICON_SIZE} /> : <TextSelect size={CHIP_ICON_SIZE} />}
          {attachment.kind === "note" ? attachment.title || translate("sidebar.untitled") : translate("ai.selectionChip", { count: attachment.text.length })}
        </span>
      ))}
    </div>
  );
}

// 答えの文に対してできること（答え終えた答えだけに出す）。開いているメモが無い、書き換えられないときは、コピーだけ。
export type AnswerActions = {
  canInsert: boolean;
  // 答えのすぐ前の発言に、入れ替えられる選択範囲があるか。
  canReplaceSelection: boolean;
  onReplaceSelection: (answer: string) => void;
  onInsertAtCursor: (answer: string) => void;
  onAppend: (answer: string) => void;
};

type AiChatMessageViewProps = {
  message: AiChatMessage;
  // 答えを受け取っている途中か。
  isReceiving: boolean;
  answerActions: AnswerActions;
  noteExists: (noteId: string) => boolean;
  onOpenNote: (noteId: string) => void;
  onOpenAiSettings: () => void;
};

export function AiChatMessageView({ message, isReceiving, answerActions, noteExists, onOpenNote, onOpenAiSettings }: AiChatMessageViewProps) {
  if (message.role === "user") {
    return (
      <div className="ai-message user">
        {message.attachments.length > 0 && <AttachmentChips attachments={message.attachments} />}
        <div className="ai-message-text">{message.text}</div>
      </div>
    );
  }
  const answer = answerTextOf(message);
  return (
    <div className="ai-message assistant">
      {message.parts.length === 0 && isReceiving && <div className="ai-message-text">{translate("ai.waiting")}</div>}
      {message.parts.map((part, index) => (part.kind === "text"
        ? <div key={index} className="ai-message-text">{part.text}</div>
        : <AiToolActivityLine key={part.activity.toolCallId} activity={part.activity} noteExists={noteExists} onOpenNote={onOpenNote} onOpenAiSettings={onOpenAiSettings} />))}
      {message.answeredWithoutTools && <p className="hint">{translate("ai.answeredWithoutTools")}</p>}
      {answer !== "" && !isReceiving && (
        <div className="ai-message-actions">
          <button type="button" className="text-button" onClick={() => void navigator.clipboard.writeText(answer)}>{translate("ai.copy")}</button>
          {answerActions.canReplaceSelection && <button type="button" className="text-button" onClick={() => answerActions.onReplaceSelection(answer)}>{translate("ai.replaceSelection")}</button>}
          {answerActions.canInsert && (
            <>
              <button type="button" className="text-button" onClick={() => answerActions.onInsertAtCursor(answer)}>{translate("ai.insertAtCursor")}</button>
              <button type="button" className="text-button" onClick={() => answerActions.onAppend(answer)}>{translate("ai.append")}</button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
