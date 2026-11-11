// 本文で「/」を打ったときに選べるブロックの一覧と、打った文字での絞り込み。

import type { Editor } from "@tiptap/react";
import {
  Code, FileSymlink, Heading1, Heading2, Heading3, ImagePlus, LayoutTemplate, List, ListChecks, ListOrdered, type LucideIcon, Minus, Paperclip, Pilcrow, Table, TextQuote,
} from "lucide-react";
import { translate } from "../i18n/translate";

// エディタの外の画面を開く操作（ファイルの選択、リンクするメモの選択）。NoteEditor が用意する。
export type SlashCommandActions = {
  pickImage: () => void;
  pickFile: () => void;
  pickNoteLink: () => void;
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

const HEADING_ICONS = { 1: Heading1, 2: Heading2, 3: Heading3 } as const;

const heading = (level: 1 | 2 | 3): SlashCommand => ({
  id: `heading${level}`,
  icon: HEADING_ICONS[level],
  name: () => translate(`editor.heading${level}`),
  keywords: [`h${level}`, "heading", "midashi", "みだし"],
  run: (editor) => editor.chain().focus().setHeading({ level }).run(),
});

export const SLASH_COMMANDS: SlashCommand[] = [
  { id: "paragraph", icon: Pilcrow, name: () => translate("editor.paragraph"), keywords: ["text", "paragraph", "honbun", "ほんぶん", "てきすと"], run: (editor) => editor.chain().focus().setParagraph().run() },
  heading(1),
  heading(2),
  heading(3),
  { id: "bulletList", icon: List, name: () => translate("editor.bulletList"), keywords: ["bullet", "list", "ul", "kajou", "かじょうがき", "りすと"], run: (editor) => editor.chain().focus().toggleBulletList().run() },
  { id: "orderedList", icon: ListOrdered, name: () => translate("editor.orderedList"), keywords: ["number", "ordered", "ol", "bangou", "ばんごう"], run: (editor) => editor.chain().focus().toggleOrderedList().run() },
  { id: "taskList", icon: ListChecks, name: () => translate("editor.taskList"), keywords: ["todo", "task", "check", "ちぇっく", "やること"], run: (editor) => editor.chain().focus().toggleTaskList().run() },
  { id: "blockquote", icon: TextQuote, name: () => translate("editor.blockquote"), keywords: ["quote", "inyou", "いんよう"], run: (editor) => editor.chain().focus().setBlockquote().run() },
  { id: "codeBlock", icon: Code, name: () => translate("editor.code"), keywords: ["code", "こーど"], run: (editor) => editor.chain().focus().setCodeBlock().run() },
  { id: "table", icon: Table, name: () => translate("editor.table"), keywords: ["table", "hyou", "ひょう"], run: (editor) => editor.chain().focus().insertTable(NEW_TABLE_SIZE).run() },
  { id: "divider", icon: Minus, name: () => translate("editor.divider"), keywords: ["divider", "hr", "line", "kugiri", "くぎり", "せん"], run: (editor) => editor.chain().focus().setHorizontalRule().run() },
  { id: "image", icon: ImagePlus, name: () => translate("editor.image"), keywords: ["image", "photo", "picture", "gazou", "がぞう", "しゃしん"], run: (_editor, actions) => actions.pickImage() },
  { id: "file", icon: Paperclip, name: () => translate("editor.file"), keywords: ["file", "attach", "tenpu", "てんぷ", "ふぁいる"], run: (_editor, actions) => actions.pickFile() },
  { id: "noteLink", icon: FileSymlink, name: () => translate("editor.noteLink"), keywords: ["link", "note", "memo", "りんく", "めも"], run: (_editor, actions) => actions.pickNoteLink() },
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
