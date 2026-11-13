// 残した会話の一覧。押すと、その会話を開いて続きを話せる。1 件ずつ消せる。

import { Trash2 } from "lucide-react";
import { MAX_SAVED_AI_CHATS } from "../../core/vault/aiChatHistory";
import { translate } from "../i18n/translate";
import { formatDateTime } from "../shared/formatTime";
import type { SavedChat } from "./aiChatSession";

type SavedChatListProps = { chats: SavedChat[]; disabled: boolean; onOpen: (chatId: string) => void; onDelete: (chat: SavedChat) => void };

export function SavedChatList({ chats, disabled, onOpen, onDelete }: SavedChatListProps) {
  return (
    <div className="ai-chat-messages" role="list" aria-label={translate("ai.history")}>
      {chats.length === 0 && <p className="ai-chat-notice">{translate("ai.historyEmpty")}</p>}
      {/* 上限を超えた会話は知らせずに消えるので、残る数を先に伝える。 */}
      {chats.length > 0 && <p className="hint">{translate("ai.historyLimit", { count: MAX_SAVED_AI_CHATS })}</p>}
      {chats.map((chat) => {
        const title = chat.title || translate("ai.untitledChat");
        return (
          <div key={chat.id} role="listitem" className="ai-saved-chat">
            <button type="button" className="ai-saved-chat-open" disabled={disabled} onClick={() => onOpen(chat.id)}>
              <span className="ai-saved-chat-title">{title}</span>
              <span className="ai-saved-chat-time">{formatDateTime(chat.updatedAt)}</span>
            </button>
            <button type="button" className="icon-button" disabled={disabled} aria-label={translate("ai.deleteChat", { title })} onClick={() => onDelete(chat)}>
              <Trash2 size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
