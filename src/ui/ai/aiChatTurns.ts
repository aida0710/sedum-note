// 開いている会話の、AI とのやり取りを進める（画面によらない部分）。送った形（つなぎ先ごとの入れ物）と、AI に渡した
// 本文の控えを、会話を開いている間だけ持ち、発言ごとにループ（aiAgentLoop.ts）を回す。
// つなぎ先（種類・モデル・キー・URL）が変わったときと、残した会話を開き直したときは、送った形を文だけの会話から
// 作り直す（Claude の thinking ブロックは、作り直した会話では使えないため入れない）。

import type { NoteRepository } from "../../core/notes/noteRepository";
import type { AiSettings, AiToolPermissions } from "../../core/vault/aiSettings";
import { bodyToMarkdown } from "../markdown/markdownDocument";
import { markdownExportContextOf } from "../markdown/repositoryMarkdownContext";
import type { NoteTool } from "../noteTools/noteTool";
import { type AgentTurnOutcome, runAgentTurn } from "./aiAgentLoop";
import { AiKnownNoteBodies, createChatNoteTools } from "./aiChatNoteTools";
import { type AiChatMessage, type ReadNoteForAi, SYSTEM_PROMPT, textMessagesOf, userMessageContent } from "./aiConversation";
import { type AiToolActivity, createToolCallRunner, type RequestApproval } from "./aiToolCalls";
import type { AiTextMessage, AiTranscript } from "./aiTranscript";
import { type ClaudeConnection, ClaudeTranscript } from "./claudeTranscript";
import { type OpenAiCompatibleConnection, OpenAiCompatibleTranscript } from "./openAiCompatibleTranscript";

type AiConnection = { provider: "claude"; claude: ClaudeConnection } | { provider: "openAiCompatible"; openAiCompatible: OpenAiCompatibleConnection };

function connectionOf(settings: AiSettings): AiConnection {
  if (settings.provider === "claude") {
    const { apiKey, model, models } = settings.claude;
    return { provider: "claude", claude: { apiKey, model, maxOutputTokens: models.find((option) => option.id === model)?.maxOutputTokens ?? null } };
  }
  const { baseUrl, apiKey, model } = settings.openAiCompatible;
  return { provider: "openAiCompatible", openAiCompatible: { baseUrl, apiKey, model } };
}

// 中身は文字と数だけなので、JSON にして比べる（項目の並びは connectionOf がいつも同じに作る）。
const sameConnection = (left: AiConnection, right: AiConnection): boolean => JSON.stringify(left) === JSON.stringify(right);

function createTranscript(connection: AiConnection, tools: NoteTool[], previousMessages: AiTextMessage[]): AiTranscript {
  const definitions = { system: SYSTEM_PROMPT, tools: tools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })), previousMessages };
  return connection.provider === "claude" ? new ClaudeTranscript(connection.claude, definitions) : new OpenAiCompatibleTranscript(connection.openAiCompatible, definitions);
}

// 開いている会話の、送った形と、それに結び付いたもの。
type OpenedTranscript = { connection: AiConnection; transcript: AiTranscript; knownBodies: AiKnownNoteBodies; tools: NoteTool[] };

export type AiTurnInput = {
  settings: AiSettings;
  // 今回の発言より前の会話（送った形を作り直すときに使う）。
  previousMessages: AiChatMessage[];
  message: Extract<AiChatMessage, { role: "user" }>;
  // その時点の許可（会話の途中で設定を変えたら、次の呼び出しから効く）。
  permissions: () => AiToolPermissions;
  requestApproval: RequestApproval;
  onText: (text: string) => void;
  onToolCallStart: (toolName: string) => void;
  onActivity: (activity: AiToolActivity) => void;
  signal: AbortSignal;
};

export class AiChatTurns {
  readonly #repository: NoteRepository;
  #opened: OpenedTranscript | null = null;

  constructor(repository: NoteRepository) {
    this.#repository = repository;
  }

  // 新しい会話を始めた、残した会話を開いた: 送った形を捨てる（次の発言で、画面の会話から作り直す）。
  forgetTranscript(): void {
    this.#opened = null;
  }

  async runTurn(input: AiTurnInput): Promise<AgentTurnOutcome> {
    const opened = this.#openedFor(connectionOf(input.settings), input.previousMessages);
    opened.transcript.addUserMessage(userMessageContent(input.message, this.#readNoteFor(opened.knownBodies)));
    const runToolCalls = createToolCallRunner({ tools: opened.tools, permissions: input.permissions, requestApproval: input.requestApproval, onActivity: input.onActivity });
    return runAgentTurn({ transcript: opened.transcript, runToolCalls, onText: input.onText, onToolCallStart: input.onToolCallStart, signal: input.signal });
  }

  #openedFor(connection: AiConnection, previousMessages: AiChatMessage[]): OpenedTranscript {
    if (this.#opened && sameConnection(this.#opened.connection, connection)) {
      return this.#opened;
    }
    const knownBodies = new AiKnownNoteBodies();
    const tools = createChatNoteTools(this.#repository, knownBodies);
    const transcript = createTranscript(connection, tools, textMessagesOf(previousMessages, this.#readNoteFor(knownBodies)));
    this.#opened = { connection, transcript, knownBodies, tools };
    return this.#opened;
  }

  // 添えたメモの今の題と本文を読み、AI に渡した本文として控える。
  #readNoteFor(knownBodies: AiKnownNoteBodies): ReadNoteForAi {
    const exportContext = markdownExportContextOf(this.#repository);
    return (noteId) => {
      const note = this.#repository.note(noteId);
      if (!note) {
        return null;
      }
      const markdown = bodyToMarkdown(note.body, exportContext);
      knownBodies.remember(noteId, markdown);
      return { title: note.content.title, markdown };
    };
  }
}
