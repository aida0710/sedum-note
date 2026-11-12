// AI とのチャットの、画面をまたいで保つ状態: 開いているか、これまでの会話、いま開いているメモのエディタ。
// 会話は保存しない（ロックするか、アプリを閉じると消える）。メモを切り替えても続けられるよう、メモの画面より上で持つ。

import type { Editor } from "@tiptap/react";
import { createContext, type ReactNode, useContext, useMemo, useState } from "react";
import type { AiChatMessage } from "./aiConversation";

// いま開いているメモ。チャットが、選択範囲を読み、答えを入れる先。開いていなければ null。
export type ActiveNoteEditor = { editor: Editor; noteId: string; noteTitle: string };

export type AiChatSession = {
  open: boolean;
  setOpen: (open: boolean) => void;
  messages: AiChatMessage[];
  setMessages: (update: (messages: AiChatMessage[]) => AiChatMessage[]) => void;
  activeNote: ActiveNoteEditor | null;
  setActiveNote: (activeNote: ActiveNoteEditor | null) => void;
};

const AiChatSessionContext = createContext<AiChatSession | null>(null);

export function AiChatSessionProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<AiChatMessage[]>([]);
  const [activeNote, setActiveNote] = useState<ActiveNoteEditor | null>(null);
  const session = useMemo(() => ({ open, setOpen, messages, setMessages, activeNote, setActiveNote }), [open, messages, activeNote]);
  return <AiChatSessionContext.Provider value={session}>{children}</AiChatSessionContext.Provider>;
}

export function useAiChatSession(): AiChatSession {
  const session = useContext(AiChatSessionContext);
  if (!session) {
    throw new Error("the AI chat session is used outside its provider");
  }
  return session;
}
