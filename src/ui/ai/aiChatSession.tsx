// AI とのチャットの、画面をまたいで保つ状態: 開いているか、今の会話、その会話だけの切り替え（conversationOverrides.ts）、
// 動いている発言（useAiChatTurn.ts）、残した会話の一覧、いま開いているメモのエディタ。メモを切り替えても、チャットの欄を
// 閉じても続けられるよう、メモの画面より上で持つ。
// 会話は、答えが届き終わるたびに手元に残す（core/vault/aiChatHistory.ts）。

import type { Editor } from "@tiptap/react";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { newRandomId } from "../../core/crypto/randomId";
import { readSavedAiChats, type SavedAiChat, writeSavedAiChats } from "../../core/vault/aiChatHistory";
import type { AiSettings } from "../../core/vault/aiSettings";
import type { UnlockedVault } from "../../core/vault/vaultSession";
import { type AiAttachment, type AiChatMessage, type AiQuickRequest, chatTitleOf } from "./aiConversation";
import { useAiSettings } from "./aiSettingsAccess";
import { type ConversationOverrides, NO_CONVERSATION_OVERRIDES, settingsForConversation } from "./conversationOverrides";
import { type AiChatTurn, useAiChatTurn } from "./useAiChatTurn";

// いま開いているメモ。チャットが、選択範囲を読み、答えを入れる先。開いていなければ null。
export type ActiveNoteEditor = { editor: Editor; noteId: string; noteTitle: string };

export type SavedChat = SavedAiChat<AiChatMessage>;

// チャットの外（本文で選んだ所の上のボタン）から頼まれた、まだ送っていない依頼。つなぎ先の設定を読み終えたら送る。
export type AiPendingRequest = { text: string; attachments: AiAttachment[]; quickRequest: AiQuickRequest };

export type AiChatSession = AiChatTurn & {
  open: boolean;
  setOpen: (open: boolean) => void;
  messages: AiChatMessage[];
  // 設定に、その会話だけの切り替えを重ねた設定。読み込みが済むまでは null。
  conversationSettings: AiSettings | null;
  setConversationOverrides: (change: (overrides: ConversationOverrides) => ConversationOverrides) => void;
  activeNote: ActiveNoteEditor | null;
  setActiveNote: (activeNote: ActiveNoteEditor | null) => void;
  // 残した会話（新しく話した順）。読み込みが済むまでは null。
  savedChats: SavedChat[] | null;
  startNewChat: () => void;
  openSavedChat: (chatId: string) => void;
  deleteSavedChat: (chatId: string) => Promise<void>;
  setPendingRequest: (request: AiPendingRequest | null) => void;
};

const AiChatSessionContext = createContext<AiChatSession | null>(null);

type AiChatSessionProviderProps = { vault: UnlockedVault; children: ReactNode };

export function AiChatSessionProvider({ vault, children }: AiChatSessionProviderProps) {
  const { settings } = useAiSettings();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<AiChatMessage[]>([]);
  const [overrides, setConversationOverrides] = useState(NO_CONVERSATION_OVERRIDES);
  const conversationSettings = useMemo(() => settings && settingsForConversation(settings, overrides), [settings, overrides]);
  const [activeNote, setActiveNote] = useState<ActiveNoteEditor | null>(null);
  const [savedChats, setSavedChats] = useState<SavedChat[] | null>(null);
  const [pendingRequest, setPendingRequest] = useState<AiPendingRequest | null>(null);
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

  const turn = useAiChatTurn({ repository: vault.repository, settings: conversationSettings, messages, setMessages, saveChat });
  const { forgetTranscript } = turn;

  const startNewChat = useCallback(() => {
    forgetTranscript();
    setMessages(() => []);
    setConversationOverrides(NO_CONVERSATION_OVERRIDES);
    setCurrentChatId(null);
  }, [forgetTranscript, setMessages]);

  const openSavedChat = useCallback((chatId: string) => {
    const chat = savedChats?.find((candidate) => candidate.id === chatId);
    if (chat) {
      forgetTranscript();
      setMessages(() => chat.messages);
      setConversationOverrides(NO_CONVERSATION_OVERRIDES);
      setCurrentChatId(chat.id);
    }
  }, [forgetTranscript, savedChats, setMessages]);

  const deleteSavedChat = useCallback(async (chatId: string) => {
    await rewriteSavedChats((chats) => chats.filter((chat) => chat.id !== chatId));
    if (chatId === currentChatId) {
      startNewChat();
    }
  }, [currentChatId, rewriteSavedChats, startNewChat]);

  // 本文で選んだ所の上のボタンから頼まれた依頼は、つなぎ先の設定を読み終えたら送る。AI を有効にしていなければ、送らずに
  // 捨てる（有効にしてから、あとで思いがけず送られないように）。
  useEffect(() => {
    if (!pendingRequest || conversationSettings === null || turn.running) {
      return;
    }
    setPendingRequest(null);
    if (conversationSettings.enabled) {
      void turn.send(pendingRequest.text, pendingRequest.attachments, pendingRequest.quickRequest);
    }
  });

  const session = useMemo(() => ({
    ...turn, open, setOpen, messages, conversationSettings, setConversationOverrides, activeNote, setActiveNote, savedChats, startNewChat, openSavedChat,
    deleteSavedChat, setPendingRequest,
  }), [turn, open, messages, conversationSettings, activeNote, savedChats, startNewChat, openSavedChat, deleteSavedChat]);
  return <AiChatSessionContext.Provider value={session}>{children}</AiChatSessionContext.Provider>;
}

export function useAiChatSession(): AiChatSession {
  const session = useContext(AiChatSessionContext);
  if (!session) {
    throw new Error("the AI chat session is used outside its provider");
  }
  return session;
}
