// AI とのチャットの、画面をまたいで保つ状態: 開いているか、今の会話、残した会話の一覧、いま開いているメモのエディタ。
// メモを切り替えても続けられるよう、メモの画面より上で持つ。会話は、答えが届くたびに手元に残す（core/vault/aiChatHistory.ts）。

import type { Editor } from "@tiptap/react";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { newRandomId } from "../../core/crypto/randomId";
import { readSavedAiChats, type SavedAiChat, writeSavedAiChats } from "../../core/vault/aiChatHistory";
import type { UnlockedVault } from "../../core/vault/vaultSession";
import { type AiChatMessage, chatTitleOf } from "./aiConversation";
import type { NoteEditProposal } from "./noteEditProposal";

// いま開いているメモ。チャットが、選択範囲を読み、答えを入れる先。開いていなければ null。
export type ActiveNoteEditor = { editor: Editor; noteId: string; noteTitle: string };

export type SavedChat = SavedAiChat<AiChatMessage>;

export type AiChatSession = {
  open: boolean;
  setOpen: (open: boolean) => void;
  messages: AiChatMessage[];
  setMessages: (update: (messages: AiChatMessage[]) => AiChatMessage[]) => void;
  activeNote: ActiveNoteEditor | null;
  setActiveNote: (activeNote: ActiveNoteEditor | null) => void;
  // 残した会話（新しく話した順）。読み込みが済むまでは null。
  savedChats: SavedChat[] | null;
  // 今の会話を残す（同じ会話なら上書きする）。答えが届き終わったときに呼ぶ。
  saveChat: (messages: AiChatMessage[]) => Promise<void>;
  startNewChat: () => void;
  openSavedChat: (chatId: string) => void;
  deleteSavedChat: (chatId: string) => Promise<void>;
  // AI が出したメモの直しの案（道具の呼び出しの ID ごと）。会話には残さず、チャットを閉じても、この画面の間は持つ。
  editProposals: ReadonlyMap<string, NoteEditProposal>;
  rememberEditProposal: (toolCallId: string, proposal: NoteEditProposal) => void;
};

const AiChatSessionContext = createContext<AiChatSession | null>(null);

type AiChatSessionProviderProps = { vault: UnlockedVault; children: ReactNode };

export function AiChatSessionProvider({ vault, children }: AiChatSessionProviderProps) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<AiChatMessage[]>([]);
  const [activeNote, setActiveNote] = useState<ActiveNoteEditor | null>(null);
  const [savedChats, setSavedChats] = useState<SavedChat[] | null>(null);
  const [editProposals, setEditProposals] = useState<ReadonlyMap<string, NoteEditProposal>>(new Map());
  const rememberEditProposal = useCallback((toolCallId: string, proposal: NoteEditProposal) => {
    setEditProposals((current) => new Map(current).set(toolCallId, proposal));
  }, []);
  // 今の会話を、残した会話のどれとして書くか。まだ一度も残していなければ null（初めて残すときに決める）。
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  useEffect(() => {
    let current = true;
    void readSavedAiChats<AiChatMessage>(vault.localStore, vault.masterKey).then((stored) => current && setSavedChats(stored));
    return () => { current = false; };
  }, [vault]);

  // ほかのウィンドウが残した会話を消さないよう、書く直前に読み直して、変える 1 件だけを差し替える。
  const rewriteSavedChats = useCallback(async (change: (chats: SavedChat[]) => SavedChat[]) => {
    const stored = await readSavedAiChats<AiChatMessage>(vault.localStore, vault.masterKey);
    setSavedChats(await writeSavedAiChats(vault.localStore, vault.masterKey, change(stored)));
  }, [vault]);

  const saveChat = useCallback(async (chatMessages: AiChatMessage[]) => {
    if (chatMessages.length === 0) {
      return;
    }
    const chatId = currentChatId ?? newRandomId();
    setCurrentChatId(chatId);
    const now = new Date().toISOString();
    await rewriteSavedChats((chats) => {
      const createdAt = chats.find((chat) => chat.id === chatId)?.createdAt ?? now;
      const saved: SavedChat = { id: chatId, title: chatTitleOf(chatMessages), createdAt, updatedAt: now, messages: chatMessages };
      return [saved, ...chats.filter((chat) => chat.id !== chatId)];
    });
  }, [currentChatId, rewriteSavedChats]);

  const startNewChat = useCallback(() => {
    setMessages([]);
    setCurrentChatId(null);
  }, []);

  const openSavedChat = useCallback((chatId: string) => {
    const chat = savedChats?.find((candidate) => candidate.id === chatId);
    if (chat) {
      setMessages(chat.messages);
      setCurrentChatId(chat.id);
    }
  }, [savedChats]);

  const deleteSavedChat = useCallback(async (chatId: string) => {
    await rewriteSavedChats((chats) => chats.filter((chat) => chat.id !== chatId));
    if (chatId === currentChatId) {
      startNewChat();
    }
  }, [currentChatId, rewriteSavedChats, startNewChat]);

  const session = useMemo(() => ({
    open, setOpen, messages, setMessages, activeNote, setActiveNote, savedChats, saveChat, startNewChat, openSavedChat, deleteSavedChat, editProposals, rememberEditProposal,
  }), [open, messages, activeNote, savedChats, saveChat, startNewChat, openSavedChat, deleteSavedChat, editProposals, rememberEditProposal]);
  return <AiChatSessionContext.Provider value={session}>{children}</AiChatSessionContext.Provider>;
}

export function useAiChatSession(): AiChatSession {
  const session = useContext(AiChatSessionContext);
  if (!session) {
    throw new Error("the AI chat session is used outside its provider");
  }
  return session;
}
