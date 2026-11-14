// 本文で「/」を打ったときに選べるブロックの一覧と、打った文字での絞り込み。

import type { Editor } from "@tiptap/react";
import {
  AlarmClock, CalendarClock, CalendarDays, Code, Columns2, FileSymlink, Heading1, Heading2, Heading3, Heading4, Heading5, Heading6, ImagePlus, Info, Lightbulb, Link2, ListFilter, MonitorPlay, OctagonAlert, PenTool, ScanLine, Sigma, SquareDashedBottom, Superscript, TriangleAlert, Workflow, LayoutTemplate, List, ListChecks, ListOrdered, type LucideIcon, Mic, Minus, Paperclip, Pilcrow, Table, TextQuote,
} from "lucide-react";
import { translate } from "../i18n/translate";
import { HEADING_LEVELS, type HeadingLevel } from "./headingLevels";
import { insertCurrentDateTime } from "./insertDateTime";
import { CALLOUT_KINDS } from "./calloutNode";
import { NOTE_QUERY_NODE } from "./noteQueryNode";
import { BLOCK_MATH_NODE } from "./mathNodes";
import { MERMAID_LANGUAGE } from "./mermaidDiagrams";
import { COLUMN_COUNTS } from "./columnsNode";
import { DRAWING_NODE } from "./drawingNode";
import { EMBED_NODE } from "./embedNode";

// エディタの外の画面を開く操作（ファイルの選択、リンクするメモの選択）。NoteEditor が用意する。
export type SlashCommandActions = {
  pickImage: () => void;
  pickFile: () => void;
  pickNoteLink: () => void;
  pickBlockLink: () => void;
  pickBlockEmbed: () => void;
  // 書類を撮る（か写真を選ぶ）画面を開く。
  scanDocument: () => void;
  // カーソルのある行に付ける期限を選ぶ画面を開く。
  pickTaskDue: () => void;
  // 録音を始める。録音できない環境と、録音している間は undefined（候補に出さない）。
  startRecording?: () => void;
  // 登録してあるテンプレート。候補の最後に並べる。
  templates: Array<{ id: string; title: string }>;
  // テンプレートの本文を、カーソルの所に入れる。
  insertTemplate: (templateId: string) => void;
};

// メニューで見出しを付けてまとめる単位。並びは SLASH_COMMAND_GROUPS の順。
export const SLASH_COMMAND_GROUPS = ["basic", "blocks", "media", "insert", "links", "templates"] as const;
export type SlashCommandGroup = (typeof SLASH_COMMAND_GROUPS)[number];

export type SlashCommand = {
  id: string;
  group: SlashCommandGroup;
  icon: LucideIcon;
  // メニューに出す名前（名詞）。
  name: () => string;
  // 名前だけでは何を入れるか分かりにくいものに、2 行目に小さく出す説明。
  description?: () => string;
  // 同じブロックにできる、行の頭で打つ書き方（「# 」「- 」など。後ろの空白は出さない）。打てるものだけ。
  shortcut?: string;
  // 絞り込みに使う言葉（英語と、かな・ローマ字）。文言のほかにこれでも当たる。
  keywords: string[];
  run: (editor: Editor, actions: SlashCommandActions) => void;
  // 候補に出すか。省くと、いつも出す。
  isAvailable?: (actions: SlashCommandActions) => boolean;
};

// 挿入する表の大きさ（見出しの行を含む）。ツールバーの表のメニューと同じ。
export const NEW_TABLE_SIZE = { rows: 3, cols: 3, withHeaderRow: true } as const;

// 「/」から図を入れたときに、最初に入れておく中身（すぐ図が出て、書き方の手がかりになる）。箱の中の文字は、画面の言語で入れる。
const newDiagramSource = () => `graph TD\n  A[${translate("editor.diagramSampleStart")}] --> B[${translate("editor.diagramSampleEnd")}]`;

const CALLOUT_ICONS = { note: Info, tip: Lightbulb, warning: TriangleAlert, danger: OctagonAlert } as const;

const HEADING_ICONS = { 1: Heading1, 2: Heading2, 3: Heading3, 4: Heading4, 5: Heading5, 6: Heading6 } as const;

const heading = (level: HeadingLevel): SlashCommand => ({
  id: `heading${level}`,
  group: "basic",
  icon: HEADING_ICONS[level],
  shortcut: "#".repeat(level),
  name: () => translate(`editor.heading${level}`),
  keywords: [`h${level}`, "heading", "midashi", "みだし"],
  run: (editor) => editor.chain().focus().setHeading({ level }).run(),
});

// まとまりの順（SLASH_COMMAND_GROUPS）に並べる。絞り込んだときも、この順のまま出す。
export const SLASH_COMMANDS: SlashCommand[] = [
  { id: "paragraph", group: "basic", icon: Pilcrow, name: () => translate("editor.paragraph"), keywords: ["text", "paragraph", "honbun", "ほんぶん", "てきすと"], run: (editor) => editor.chain().focus().setParagraph().run() },
  ...HEADING_LEVELS.map(heading),
  { id: "bulletList", group: "basic", icon: List, name: () => translate("editor.slash.bulletList"), shortcut: "-", keywords: ["bullet", "list", "ul", "kajou", "かじょうがき", "りすと"], run: (editor) => editor.chain().focus().toggleBulletList().run() },
  { id: "orderedList", group: "basic", icon: ListOrdered, name: () => translate("editor.orderedList"), shortcut: "1.", keywords: ["number", "ordered", "ol", "bangou", "ばんごう"], run: (editor) => editor.chain().focus().toggleOrderedList().run() },
  { id: "taskList", group: "basic", icon: ListChecks, name: () => translate("editor.taskList"), shortcut: "[ ]", keywords: ["todo", "task", "check", "ちぇっく", "やること"], run: (editor) => editor.chain().focus().toggleTaskList().run() },
  { id: "blockquote", group: "basic", icon: TextQuote, name: () => translate("editor.blockquote"), shortcut: ">", keywords: ["quote", "inyou", "いんよう"], run: (editor) => editor.chain().focus().setBlockquote().run() },
  { id: "divider", group: "basic", icon: Minus, name: () => translate("editor.divider"), shortcut: "---", keywords: ["divider", "hr", "line", "kugiri", "くぎり", "せん"], run: (editor) => editor.chain().focus().setHorizontalRule().run() },
  { id: "codeBlock", group: "blocks", icon: Code, name: () => translate("editor.code"), shortcut: "```", keywords: ["code", "こーど"], run: (editor) => editor.chain().focus().setCodeBlock().run() },
  { id: "table", group: "blocks", icon: Table, name: () => translate("editor.table"), keywords: ["table", "hyou", "ひょう"], run: (editor) => editor.chain().focus().insertTable(NEW_TABLE_SIZE).run() },
  ...CALLOUT_KINDS.map((kind): SlashCommand => ({
    id: `callout:${kind}`, group: "blocks", icon: CALLOUT_ICONS[kind], name: () => translate(`editor.callout.${kind}`), keywords: ["callout", kind, "kakomi", "かこみ", "こーるあうと"],
    run: (editor) => editor.chain().focus().setCallout(kind).run(),
  })),
  ...COLUMN_COUNTS.map((columnCount): SlashCommand => ({
    id: `columns:${columnCount}`, group: "blocks", icon: Columns2, name: () => translate("editor.columns", { count: columnCount }), keywords: ["columns", "dangumi", "だんぐみ", "よこ"],
    run: (editor) => editor.chain().focus().insertColumns(columnCount).run(),
  })),
  { id: "math", group: "blocks", icon: Sigma, name: () => translate("editor.math"), keywords: ["math", "latex", "formula", "suushiki", "すうしき"], run: (editor) => editor.chain().focus().insertContent({ type: BLOCK_MATH_NODE }).run() },
  {
    id: "diagram", group: "blocks", icon: Workflow, name: () => translate("editor.slash.diagram"), description: () => translate("editor.slash.diagramDescription"),
    keywords: ["diagram", "mermaid", "chart", "zu", "ず", "ふろー"],
    run: (editor) => editor.chain().focus().insertContent({ type: "codeBlock", attrs: { language: MERMAID_LANGUAGE }, content: [{ type: "text", text: newDiagramSource() }] }).run(),
  },
  { id: "drawing", group: "blocks", icon: PenTool, name: () => translate("editor.drawing"), keywords: ["draw", "drawing", "sketch", "shape", "tegaki", "てがき", "ずけい", "え"], run: (editor) => editor.chain().focus().insertContent({ type: DRAWING_NODE }).run() },
  { id: "image", group: "media", icon: ImagePlus, name: () => translate("editor.slash.image"), keywords: ["image", "photo", "picture", "gazou", "がぞう", "しゃしん"], run: (_editor, actions) => actions.pickImage() },
  { id: "file", group: "media", icon: Paperclip, name: () => translate("editor.slash.file"), keywords: ["file", "attach", "tenpu", "てんぷ", "ふぁいる"], run: (_editor, actions) => actions.pickFile() },
  {
    id: "recording", group: "media", icon: Mic, name: () => translate("editor.slash.recording"), keywords: ["record", "audio", "voice", "rokuon", "ろくおん", "おと", "こえ"],
    isAvailable: (actions) => actions.startRecording !== undefined, run: (_editor, actions) => actions.startRecording?.(),
  },
  { id: "scan", group: "media", icon: ScanLine, name: () => translate("editor.scan"), keywords: ["scan", "document", "camera", "sukyan", "すきゃん", "しょるい"], run: (_editor, actions) => actions.scanDocument() },
  {
    id: "embed", group: "media", icon: MonitorPlay, name: () => translate("editor.slash.embed"), description: () => translate("editor.slash.embedDescription"),
    keywords: ["embed", "video", "youtube", "umekomi", "うめこみ", "どうが"], run: (editor) => editor.chain().focus().insertContent({ type: EMBED_NODE }).run(),
  },
  { id: "date", group: "insert", icon: CalendarDays, name: () => translate("editor.insertDate"), keywords: ["date", "today", "hizuke", "ひづけ", "きょう"], run: (editor) => insertCurrentDateTime(editor, "date") },
  { id: "dateTime", group: "insert", icon: CalendarClock, name: () => translate("editor.insertDateTime"), keywords: ["time", "now", "datetime", "nichiji", "にちじ", "じこく", "いま"], run: (editor) => insertCurrentDateTime(editor, "dateTime") },
  {
    id: "due", group: "insert", icon: AlarmClock, name: () => translate("editor.slash.due"), description: () => translate("editor.slash.dueDescription"),
    keywords: ["due", "deadline", "reminder", "kigen", "きげん", "しめきり", "りまいんだー"], run: (_editor, actions) => actions.pickTaskDue(),
  },
  { id: "footnote", group: "insert", icon: Superscript, name: () => translate("editor.footnote"), keywords: ["footnote", "note", "kyakuchuu", "きゃくちゅう", "ちゅう"], run: (editor) => editor.chain().focus().insertFootnote().run() },
  {
    id: "noteQuery", group: "insert", icon: ListFilter, name: () => translate("editor.slash.noteQuery"), description: () => translate("editor.slash.noteQueryDescription"),
    keywords: ["query", "list", "kueri", "くえり", "いちらん"], run: (editor) => editor.chain().focus().insertContent({ type: NOTE_QUERY_NODE }).run(),
  },
  { id: "noteLink", group: "links", icon: FileSymlink, name: () => translate("editor.noteLink"), keywords: ["link", "note", "memo", "りんく", "めも"], run: (_editor, actions) => actions.pickNoteLink() },
  { id: "blockLink", group: "links", icon: Link2, name: () => translate("editor.blockLink"), keywords: ["link", "block", "burokku", "ぶろっく", "りんく"], run: (_editor, actions) => actions.pickBlockLink() },
  {
    id: "blockEmbed", group: "links", icon: SquareDashedBottom, name: () => translate("editor.slash.blockEmbed"), description: () => translate("editor.slash.blockEmbedDescription"),
    keywords: ["embed", "block", "transclude", "umekomi", "うめこみ", "ぶろっく"], run: (_editor, actions) => actions.pickBlockEmbed(),
  },
];

// テンプレートの候補の ID の頭。後ろはテンプレートのメモの ID。
export const TEMPLATE_COMMAND_ID_PREFIX = "template:";

function templateCommands(actions: SlashCommandActions): SlashCommand[] {
  return actions.templates.map((template) => ({
    id: `${TEMPLATE_COMMAND_ID_PREFIX}${template.id}`,
    group: "templates",
    icon: LayoutTemplate,
    name: () => translate("editor.templateNamed", { title: template.title || translate("sidebar.untitled") }),
    keywords: ["template", "てんぷれーと", "かた"],
    run: (_editor, currentActions) => currentActions.insertTemplate(template.id),
  }));
}

// 「/」のあとに打った文字で絞り込む。名前か言葉の一部に当たるものを、一覧の順のまま返す。打つ前は、候補に出せるものを全部返す。
export function filterSlashCommands(query: string, actions: SlashCommandActions): SlashCommand[] {
  const commands = [...SLASH_COMMANDS, ...templateCommands(actions)].filter((command) => command.isAvailable?.(actions) ?? true);
  const needle = query.trim().toLocaleLowerCase();
  if (needle === "") {
    return commands;
  }
  return commands.filter((command) =>
    command.name().toLocaleLowerCase().includes(needle) || command.keywords.some((keyword) => keyword.includes(needle)));
}
