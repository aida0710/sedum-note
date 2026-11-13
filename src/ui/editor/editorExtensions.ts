// エディタに入れる機能。保存する文書の形（Yjs の XmlFragment の中のノード名）はこの組み合わせで
// 決まるので、機能を外すと、その形を使った既存のメモが読めなくなる。機能を足したら、
// 足す前のアプリがそのノードを消さないよう、DATA_FORMAT_VERSION（core/format/dataFormat.ts）を上げる。

import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import Collaboration from "@tiptap/extension-collaboration";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { TableKit } from "@tiptap/extension-table";
import { Placeholder } from "@tiptap/extensions";
import StarterKit from "@tiptap/starter-kit";
import { common, createLowlight } from "lowlight";
import type * as Y from "yjs";
import { translate } from "../i18n/translate";
import { AttachmentFile } from "./attachmentFileNode";
import { AttachmentImage } from "./attachmentImageNode";
import { BlockMath, InlineMath } from "./mathNodes";
import { MermaidDiagrams } from "./mermaidDiagrams";
import { NoteLink } from "./noteLinkNode";
import { NoteQuery } from "./noteQueryNode";
import { SearchHighlight } from "./searchHighlightExtension";
import { SlashCommands } from "./slashCommandExtension";
import { Callout } from "./calloutNode";
import { Column, Columns } from "./columnsNode";
import { Drawing, DrawingStrokeNode } from "./drawingNode";
import { Embed } from "./embedNode";
import { Folding } from "./folding";
import { FootnoteReference } from "./footnoteNode";
import { HEADING_LEVELS } from "./headingLevels";
import { Zoom } from "./zoom";
import { Highlight } from "./highlightMark";
import { DateTimeShortcuts } from "./insertDateTime";
import { BlockDragHandle } from "./blockDragHandle";
import { MarkdownShortcutUndo } from "./markdownShortcutUndo";
import { KeepTabInEditor } from "./keepTabInEditor";
import { JapaneseListShortcuts } from "./japaneseListShortcuts";
import { ZoomOutOnEscape } from "./zoomOutOnEscape";
import { BlockKeys } from "./blockKeys";
import { BlockEmbed } from "./blockEmbedNode";
import { BlockIds } from "./blockIds";
import { ColoredTableCell, ColoredTableHeader } from "./tableCellBackground";
import { TableRowFilterExtension } from "./tableRowFilter";
import { TableShortcuts } from "./tableShortcuts";
import { TextColor } from "./textColorMark";
import { DueMarks } from "./dueMarks";
import { TypewriterScroll } from "./typewriterScroll";
import { readDevicePreferences } from "../preferences/devicePreferences";
import type { SlashMenuController } from "./slashMenuController";
import type { BlockMenuController } from "./blockMenuController";

// よく使われる言語（highlight.js の common の組）だけを入れる。言語の指定が無いコードは中身から推す。
const codeHighlighter = createLowlight(common);

// 幅を決めていない列と、ドラッグで縮められる列の、一番狭い幅（px）。1〜2 文字が入る幅にする。
const TABLE_CELL_MIN_WIDTH = 72;

// 文書の形（ノードと書式）を決める機能。エディタのほか、Markdown との変換（ui/markdown）でも使う。
export function documentExtensions() {
  return [
    StarterKit.configure({
      heading: { levels: [...HEADING_LEVELS] },
      link: { openOnClick: false, autolink: true },
      // コードの色付けつきのもの（CodeBlockLowlight）に置き換える。ノード名は同じ codeBlock。
      codeBlock: false,
      // 取り消しは Collaboration が持つ（自分の変更だけを取り消し、ほかのデバイスの変更は残す）。
      undoRedo: false,
    }),
    TaskList,
    TaskItem.configure({ nested: true }),
    // コードの中の Tab と Shift+Tab は、行の字下げを足す・減らす（コードを書くエディタと同じ）。
    CodeBlockLowlight.configure({ lowlight: codeHighlighter, enableTabIndentation: true }),
    // 列の境目をドラッグして幅を変えられる。スマホの幅では表が画面をはみ出すので、包んだ要素（tableWrapper）の中で横に送る。
    // セルは、背景色を持てるもの（ColoredTableCell・ColoredTableHeader）に置き換える。ノード名は同じ。
    TableKit.configure({ table: { resizable: true, renderWrapper: true, cellMinWidth: TABLE_CELL_MIN_WIDTH }, tableCell: false, tableHeader: false }),
    ColoredTableCell,
    ColoredTableHeader,
    Highlight,
    TextColor,
    Folding,
    BlockIds,
    Callout,
    NoteQuery,
    InlineMath,
    BlockMath,
    Columns,
    Column,
    FootnoteReference,
    Embed,
    Drawing,
    DrawingStrokeNode,
    AttachmentImage,
    AttachmentFile,
    NoteLink,
    BlockEmbed,
  ];
}

type EditorExtensionsInput = { body: Y.XmlFragment; slashMenuController: SlashMenuController; blockMenuController: BlockMenuController };

export function createEditorExtensions({ body, slashMenuController, blockMenuController }: EditorExtensionsInput) {
  return [
    ...documentExtensions(),
    SlashCommands.configure({ controller: slashMenuController }),
    MarkdownShortcutUndo,
    JapaneseListShortcuts,
    KeepTabInEditor,
    DueMarks,
    TableShortcuts,
    TableRowFilterExtension,
    MermaidDiagrams,
    BlockDragHandle.configure({ blockMenu: blockMenuController }),
    Zoom,
    ZoomOutOnEscape,
    BlockKeys,
    DateTimeShortcuts,
    TypewriterScroll.configure({ isEnabled: () => readDevicePreferences().typewriterMode, scrollContainerSelector: ".document-scroll" }),
    SearchHighlight,
    Collaboration.configure({ fragment: body }),
    Placeholder.configure({ placeholder: translate("editor.bodyPlaceholder") }),
  ];
}
