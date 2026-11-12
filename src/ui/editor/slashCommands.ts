// 本文で「/」を打ったときに選べるブロックの一覧と、打った文字での絞り込み。

import type { Editor } from "@tiptap/react";
import {
  CalendarClock, CalendarDays, Code, Columns2, FileSymlink, Heading1, Heading2, Heading3, Heading4, Heading5, Heading6, ImagePlus, Info, Lightbulb, Link2, ListFilter, MonitorPlay, OctagonAlert, Sigma, Superscript, TriangleAlert, Workflow, LayoutTemplate, List, ListChecks, ListOrdered, type LucideIcon, Minus, Paperclip, Pilcrow, Table, TextQuote,
} from "lucide-react";
import { translate } from "../i18n/translate";
import { HEADING_LEVELS, type HeadingLevel } from "./headingLevels";
import { insertCurrentDateTime } from "./insertDateTime";
import { CALLOUT_KINDS } from "./calloutNode";
import { NOTE_QUERY_NODE } from "./noteQueryNode";
import { BLOCK_MATH_NODE } from "./mathNodes";
import { MERMAID_LANGUAGE } from "./mermaidDiagrams";
import { COLUMN_COUNTS } from "./columnsNode";
import { EMBED_NODE } from "./embedNode";

// エディタの外の画面を開く操作（ファイルの選択、リンクするメモの選択）。NoteEditor が用意する。
export type SlashCommandActions = {
  pickImage: () => void;
  pickFile: () => void;
  pickNoteLink: () => void;
  pickBlockLink: () => void;
  // 登録してあるテンプレート。候補の最後に並べる。
  templates: Array<{ id: string; title: string }>;
  // テンプレートの本文を、カーソルの所に入れる。
  insertTemplate: (templateId: string) => void;
};

export type SlashCommand = {
  id: string;
  icon: LucideIcon;
  // メニューに出す名前。
  name: () => string;
  // 絞り込みに使う言葉（英語と、かな・ローマ字）。文言のほかにこれでも当たる。
  keywords: string[];
  run: (editor: Editor, actions: SlashCommandActions) => void;
};

// 挿入する表の大きさ（見出しの行を含む）。ツールバーの表のメニューと同じ。
export const NEW_TABLE_SIZE = { rows: 3, cols: 3, withHeaderRow: true } as const;

// 「/」から図を入れたときに、最初に入れておく中身（すぐ図が出て、書き方の手がかりになる）。
const NEW_DIAGRAM_SOURCE = "graph TD\n  A[はじめ] --> B[おわり]";

const CALLOUT_ICONS = { note: Info, tip: Lightbulb, warning: TriangleAlert, danger: OctagonAlert } as const;

const HEADING_ICONS = { 1: Heading1, 2: Heading2, 3: Heading3, 4: Heading4, 5: Heading5, 6: Heading6 } as const;

const heading = (level: HeadingLevel): SlashCommand => ({
  id: `heading${level}`,
  icon: HEADING_ICONS[level],
  name: () => translate(`editor.heading${level}`),
  keywords: [`h${level}`, "heading", "midashi", "みだし"],
  run: (editor) => editor.chain().focus().setHeading({ level }).run(),
});

export const SLASH_COMMANDS: SlashCommand[] = [
  { id: "paragraph", icon: Pilcrow, name: () => translate("editor.paragraph"), keywords: ["text", "paragraph", "honbun", "ほんぶん", "てきすと"], run: (editor) => editor.chain().focus().setParagraph().run() },
  ...HEADING_LEVELS.map(heading),
  { id: "bulletList", icon: List, name: () => translate("editor.bulletList"), keywords: ["bullet", "list", "ul", "kajou", "かじょうがき", "りすと"], run: (editor) => editor.chain().focus().toggleBulletList().run() },
  { id: "orderedList", icon: ListOrdered, name: () => translate("editor.orderedList"), keywords: ["number", "ordered", "ol", "bangou", "ばんごう"], run: (editor) => editor.chain().focus().toggleOrderedList().run() },
  { id: "taskList", icon: ListChecks, name: () => translate("editor.taskList"), keywords: ["todo", "task", "check", "ちぇっく", "やること"], run: (editor) => editor.chain().focus().toggleTaskList().run() },
  { id: "blockquote", icon: TextQuote, name: () => translate("editor.blockquote"), keywords: ["quote", "inyou", "いんよう"], run: (editor) => editor.chain().focus().setBlockquote().run() },
  ...CALLOUT_KINDS.map((kind): SlashCommand => ({
    id: `callout:${kind}`, icon: CALLOUT_ICONS[kind], name: () => translate(`editor.callout.${kind}`), keywords: ["callout", kind, "kakomi", "かこみ", "こーるあうと"],
    run: (editor) => editor.chain().focus().setCallout(kind).run(),
  })),
  { id: "codeBlock", icon: Code, name: () => translate("editor.code"), keywords: ["code", "こーど"], run: (editor) => editor.chain().focus().setCodeBlock().run() },
  { id: "table", icon: Table, name: () => translate("editor.table"), keywords: ["table", "hyou", "ひょう"], run: (editor) => editor.chain().focus().insertTable(NEW_TABLE_SIZE).run() },
  { id: "divider", icon: Minus, name: () => translate("editor.divider"), keywords: ["divider", "hr", "line", "kugiri", "くぎり", "せん"], run: (editor) => editor.chain().focus().setHorizontalRule().run() },
  { id: "image", icon: ImagePlus, name: () => translate("editor.image"), keywords: ["image", "photo", "picture", "gazou", "がぞう", "しゃしん"], run: (_editor, actions) => actions.pickImage() },
  { id: "file", icon: Paperclip, name: () => translate("editor.file"), keywords: ["file", "attach", "tenpu", "てんぷ", "ふぁいる"], run: (_editor, actions) => actions.pickFile() },
  { id: "date", icon: CalendarDays, name: () => translate("editor.insertDate"), keywords: ["date", "today", "hizuke", "ひづけ", "きょう"], run: (editor) => insertCurrentDateTime(editor, "date") },
  { id: "dateTime", icon: CalendarClock, name: () => translate("editor.insertDateTime"), keywords: ["time", "now", "datetime", "nichiji", "にちじ", "じこく", "いま"], run: (editor) => insertCurrentDateTime(editor, "dateTime") },
  ...COLUMN_COUNTS.map((columnCount): SlashCommand => ({
    id: `columns:${columnCount}`, icon: Columns2, name: () => translate("editor.columns", { count: columnCount }), keywords: ["columns", "dangumi", "だんぐみ", "よこ"],
    run: (editor) => editor.chain().focus().insertColumns(columnCount).run(),
  })),
  { id: "embed", icon: MonitorPlay, name: () => translate("editor.embed"), keywords: ["embed", "video", "youtube", "umekomi", "うめこみ", "どうが"], run: (editor) => editor.chain().focus().insertContent({ type: EMBED_NODE }).run() },
  { id: "footnote", icon: Superscript, name: () => translate("editor.footnote"), keywords: ["footnote", "note", "kyakuchuu", "きゃくちゅう", "ちゅう"], run: (editor) => editor.chain().focus().insertFootnote().run() },
  { id: "math", icon: Sigma, name: () => translate("editor.math"), keywords: ["math", "latex", "formula", "suushiki", "すうしき"], run: (editor) => editor.chain().focus().insertContent({ type: BLOCK_MATH_NODE }).run() },
  {
    id: "diagram", icon: Workflow, name: () => translate("editor.diagram"), keywords: ["diagram", "mermaid", "chart", "zu", "ず", "ふろー"],
    run: (editor) => editor.chain().focus().insertContent({ type: "codeBlock", attrs: { language: MERMAID_LANGUAGE }, content: [{ type: "text", text: NEW_DIAGRAM_SOURCE }] }).run(),
  },
  { id: "noteQuery", icon: ListFilter, name: () => translate("editor.noteQuery"), keywords: ["query", "list", "kueri", "くえり", "いちらん"], run: (editor) => editor.chain().focus().insertContent({ type: NOTE_QUERY_NODE }).run() },
  { id: "noteLink", icon: FileSymlink, name: () => translate("editor.noteLink"), keywords: ["link", "note", "memo", "りんく", "めも"], run: (_editor, actions) => actions.pickNoteLink() },
  { id: "blockLink", icon: Link2, name: () => translate("editor.blockLink"), keywords: ["link", "block", "burokku", "ぶろっく", "りんく"], run: (_editor, actions) => actions.pickBlockLink() },
];

function templateCommands(actions: SlashCommandActions): SlashCommand[] {
  return actions.templates.map((template) => ({
    id: `template:${template.id}`,
    icon: LayoutTemplate,
    name: () => translate("editor.templateNamed", { title: template.title || translate("sidebar.untitled") }),
    keywords: ["template", "てんぷれーと", "かた"],
    run: (_editor, currentActions) => currentActions.insertTemplate(template.id),
  }));
}

// 「/」のあとに打った文字で絞り込む。名前か言葉の一部に当たるものを、一覧の順のまま返す。
export function filterSlashCommands(query: string, actions: SlashCommandActions): SlashCommand[] {
  const commands = [...SLASH_COMMANDS, ...templateCommands(actions)];
  const needle = query.trim().toLocaleLowerCase();
  if (needle === "") {
    return commands;
  }
  return commands.filter((command) =>
    command.name().toLocaleLowerCase().includes(needle) || command.keywords.some((keyword) => keyword.includes(needle)));
}
