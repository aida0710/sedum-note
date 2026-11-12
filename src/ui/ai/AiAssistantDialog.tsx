// メモの AI アシスタント。開いているメモを AI に渡して、要約・書き直し・質問を頼み、答えをメモの末尾に足せる。

import { useEffect, useRef, useState } from "react";
import type { AiSettings } from "../../core/vault/aiSettings";
import { describeError } from "../i18n/describeError";
import { type MessageKey, translate } from "../i18n/translate";
import { isImeKeyEvent } from "../shared/imeKeyEvent";
import { ModalDialog } from "../shared/ModalDialog";
import { AI_TASK_KINDS, type AiTaskKind, aiPromptFor } from "./aiTasks";
import { useAiSettings } from "./aiSettingsAccess";
import { streamClaudeCompletion } from "./claudeCompletion";
import { streamOpenAiCompatibleCompletion } from "./openAiCompatibleCompletion";

type AiAssistantDialogProps = {
  noteTitle: string;
  // 今の本文を Markdown にしたものを返す（頼むたびに、その時点の本文を渡すため）。
  noteMarkdown: () => string;
  // 答えを、メモの末尾に足す。
  onAppend: (markdown: string) => Promise<void>;
  onClose: () => void;
};

const TASK_LABELS: Record<AiTaskKind, MessageKey> = { summarize: "ai.task.summarize", rewrite: "ai.task.rewrite", ask: "ai.task.ask" };

function streamCompletion(settings: AiSettings, input: { prompt: ReturnType<typeof aiPromptFor>; onText: (text: string) => void; signal: AbortSignal }): Promise<void> {
  return settings.provider === "claude"
    ? streamClaudeCompletion({ ...settings.claude, ...input })
    : streamOpenAiCompatibleCompletion({ ...settings.openAiCompatible, ...input });
}

export function AiAssistantDialog({ noteTitle, noteMarkdown, onAppend, onClose }: AiAssistantDialogProps) {
  const { settings } = useAiSettings();
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [running, setRunning] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const request = useRef<AbortController | null>(null);
  // ダイアログを閉じたら、途中の頼みを止める。
  useEffect(() => () => request.current?.abort(), []);

  const run = async (kind: AiTaskKind) => {
    if (!settings) {
      return;
    }
    const controller = new AbortController();
    request.current = controller;
    setAnswer("");
    setErrorMessage(null);
    setRunning(true);
    try {
      await streamCompletion(settings, {
        prompt: aiPromptFor({ kind, noteTitle, noteMarkdown: noteMarkdown(), question: question.trim() }),
        onText: (text) => setAnswer((current) => current + text),
        signal: controller.signal,
      });
    } catch (error) {
      if (!controller.signal.aborted) {
        setErrorMessage(describeError(error));
      }
    } finally {
      setRunning(false);
    }
  };

  const ready = settings?.enabled === true;
  return (
    <ModalDialog label={translate("ai.assistant")} className="ai-assistant" onClose={onClose}>
      <p>{translate(ready ? "ai.assistantDescription" : "ai.notEnabled")}</p>
      {ready && (
        <>
          <div className="form-actions ai-tasks">
            {AI_TASK_KINDS.filter((kind) => kind !== "ask").map((kind) => (
              <button key={kind} type="button" className="secondary-button" disabled={running} onClick={() => void run(kind)}>{translate(TASK_LABELS[kind])}</button>
            ))}
          </div>
          <div className="ai-question">
            <input value={question} placeholder={translate("ai.questionPlaceholder")} aria-label={translate("ai.question")} onChange={(event) => setQuestion(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !isImeKeyEvent(event.nativeEvent) && question.trim() !== "" && !running) {
                  event.preventDefault();
                  void run("ask");
                }
              }} />
            <button type="button" className="secondary-button" disabled={running || question.trim() === ""} onClick={() => void run("ask")}>{translate(TASK_LABELS.ask)}</button>
          </div>
          {errorMessage && <div className="form-error" role="alert">{errorMessage}</div>}
          {(answer !== "" || running) && <pre className="ai-answer" aria-label={translate("ai.answer")} aria-busy={running}>{answer || translate("ai.waiting")}</pre>}
        </>
      )}
      <div className="form-actions">
        {running && <button type="button" className="secondary-button" onClick={() => request.current?.abort()}>{translate("ai.stop")}</button>}
        {answer !== "" && !running && (
          <>
            <button type="button" className="secondary-button" onClick={() => void navigator.clipboard.writeText(answer)}>{translate("ai.copy")}</button>
            <button type="button" className="primary-button" onClick={() => void onAppend(answer).then(onClose)}>{translate("ai.append")}</button>
          </>
        )}
        <button type="button" className="secondary-button" onClick={onClose}>{translate("common.close")}</button>
      </div>
    </ModalDialog>
  );
}
