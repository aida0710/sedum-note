// AI とのチャットの、1 回の発言を進める状態（動いているか、失敗の知らせ、待っている承認）と操作（送る、止める、承認を決める）。
// チャットの欄より上（AiChatSessionProvider）で持つので、欄を閉じても止まらない。ロックやスペースの切り替えで
// Provider が外れたら止める。

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { NoteRepository } from "../../core/notes/noteRepository";
import type { AiSettings } from "../../core/vault/aiSettings";
import { describeError } from "../i18n/describeError";
import { type AiAttachment, type AiChatMessage, type AiQuickRequest, withAnswerText, withToolActivity } from "./aiConversation";
import { AiChatTurns } from "./aiChatTurns";
import type { AiApprovalItem, RequestApproval } from "./aiToolCalls";

// 利用者の答えを待っている承認。decide に、承認した呼び出しの ID を渡す。
export type PendingAiApproval = { items: AiApprovalItem[]; decide: (approvedToolCallIds: ReadonlySet<string>) => void };

type AiChatTurnInput = {
  repository: NoteRepository;
  settings: AiSettings | null;
  messages: AiChatMessage[];
  setMessages: (update: (messages: AiChatMessage[]) => AiChatMessage[]) => void;
  // 答えが届き終わった会話を残す。
  saveChat: (messages: AiChatMessage[]) => Promise<void>;
};

type UserMessage = Extract<AiChatMessage, { role: "user" }>;
// AI に届く前に失敗した発言と、その前の会話。
type FailedTurn = { previousMessages: AiChatMessage[]; message: UserMessage };

export type AiChatTurn = {
  running: boolean;
  // ツールの呼び出しが始まり、まだ準備ができていないツールの名前（入力が長いと、届くまで時間がかかる）。
  startingToolName: string | null;
  errorMessage: string | null;
  setErrorMessage: (message: string | null) => void;
  pendingApproval: PendingAiApproval | null;
  send: (text: string, attachments: AiAttachment[], quickRequest?: AiQuickRequest) => Promise<void>;
  // 失敗した発言を、同じ中身で送り直す。送り直せる発言が無ければ null（AI が何かを答えた・行ったあとの失敗では、
  // 送り直すと同じ操作を繰り返すので、送り直せない）。
  retry: (() => void) | null;
  stop: () => void;
  // 新しい会話を始めた、残した会話を開いた: 送った形を捨てる。
  forgetTranscript: () => void;
};

export function useAiChatTurn({ repository, settings, messages, setMessages, saveChat }: AiChatTurnInput): AiChatTurn {
  const turns = useMemo(() => new AiChatTurns(repository), [repository]);
  const [running, setRunning] = useState(false);
  const [startingToolName, setStartingToolName] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pendingApproval, setPendingApproval] = useState<PendingAiApproval | null>(null);
  const [failedTurn, setFailedTurn] = useState<FailedTurn | null>(null);
  const controller = useRef<AbortController | null>(null);
  // 会話の途中で設定を変えたら、次のツールの呼び出しから効かせる。
  const latestSettings = useRef(settings);
  useEffect(() => {
    latestSettings.current = settings;
  }, [settings]);
  useEffect(() => () => controller.current?.abort(), [turns]);

  const requestApproval: RequestApproval = useCallback((items) => new Promise((resolve) => {
    setPendingApproval({
      items,
      decide: (approvedToolCallIds) => {
        setPendingApproval(null);
        resolve(approvedToolCallIds);
      },
    });
  }), []);

  const runMessage = async (previousMessages: AiChatMessage[], message: UserMessage) => {
    if (!settings || running) {
      return;
    }
    let answer: Extract<AiChatMessage, { role: "assistant" }> = { role: "assistant", parts: [] };
    const showAnswer = () => setMessages(() => [...previousMessages, message, answer]);
    showAnswer();
    setErrorMessage(null);
    setFailedTurn(null);
    setRunning(true);
    const turnController = new AbortController();
    controller.current = turnController;
    try {
      const outcome = await turns.runTurn({
        settings, previousMessages, message, requestApproval, signal: turnController.signal,
        permissions: () => (latestSettings.current ?? settings).permissions,
        onText: (received) => {
          setStartingToolName(null);
          answer = { ...answer, parts: withAnswerText(answer.parts, received) };
          showAnswer();
        },
        onToolCallStart: setStartingToolName,
        onActivity: (activity) => {
          setStartingToolName(null);
          answer = { ...answer, parts: withToolActivity(answer.parts, activity) };
          showAnswer();
        },
      });
      if (outcome.answeredWithoutTools) {
        answer = { ...answer, answeredWithoutTools: true };
      }
    } catch (error) {
      if (!turnController.signal.aborted) {
        setErrorMessage(describeError(error));
        setFailedTurn(answer.parts.length === 0 ? { previousMessages, message } : null);
      }
    } finally {
      controller.current = null;
      setRunning(false);
      setStartingToolName(null);
      setPendingApproval(null);
    }
    // 答えが何も無いとき（失敗、すぐ止めた）は、空の答えを会話に残さない。利用者の発言は残す（あとで送り直せる）。
    const answered = answer.parts.length === 0 ? [...previousMessages, message] : [...previousMessages, message, answer];
    setMessages(() => answered);
    void saveChat(answered);
  };

  const send = async (text: string, attachments: AiAttachment[], quickRequest?: AiQuickRequest) => {
    if (text.trim() !== "") {
      await runMessage(messages, { role: "user", text: text.trim(), attachments, quickRequest });
    }
  };

  // 失敗した発言は、送った形（AiChatTurns）に入ったままなので、送った形を捨てて、その前の会話から作り直してから送る。
  const retry = failedTurn && !running
    ? () => {
      turns.forgetTranscript();
      void runMessage(failedTurn.previousMessages, failedTurn.message);
    }
    : null;

  const stop = useCallback(() => {
    controller.current?.abort();
    setPendingApproval(null);
  }, []);

  // 新しい会話を始めた・残した会話を開いたら、前の会話の失敗も忘れる（送り直すと、別の会話に答えが入る）。
  const forgetTranscript = useCallback(() => {
    turns.forgetTranscript();
    setFailedTurn(null);
    setErrorMessage(null);
  }, [turns]);

  return { running, startingToolName, errorMessage, setErrorMessage, pendingApproval, send, retry, stop, forgetTranscript };
}
