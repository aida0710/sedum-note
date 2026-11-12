// 本文の書式・表・リンクと、写真・ファイルを添付するボタン。PC では本文の上、スマホでは画面の下に出す。

import { type Editor, useEditorState } from "@tiptap/react";
import { Baseline, Bold, Camera, Code, FileSymlink, Heading, Highlighter, ImagePlus, Italic, Link, List, ListChecks, ListOrdered, Paperclip, Underline } from "lucide-react";
import type { ReactNode } from "react";
import { translate, type MessageKey } from "../i18n/translate";
import { ColorMenu } from "./ColorMenu";
import type { EditorColorName } from "./editorColors";
import { TableMenu } from "./TableMenu";

type EditorToolbarProps = {
  editor: Editor;
  // 写真・ファイルを選ぶ画面を開く。
  onPickImage: () => void;
  onPickFile: () => void;
  // カメラを開いて、その場で撮る。カメラを出さない画面（PC）では渡さない。
  onCapturePhoto?: () => void;
  // リンク先を聞く。やめたら null。
  onAskLink: () => Promise<string | null>;
  // リンクするメモを選ぶ画面を開く。
  onPickNoteLink: () => void;
  trailing?: ReactNode;
};

const ICON_SIZE = 16;

export function EditorToolbar({ editor, onPickImage, onPickFile, onCapturePhoto, onAskLink, onPickNoteLink, trailing }: EditorToolbarProps) {
  const active = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      heading: current.isActive("heading"),
      bold: current.isActive("bold"),
      italic: current.isActive("italic"),
      underline: current.isActive("underline"),
      bulletList: current.isActive("bulletList"),
      orderedList: current.isActive("orderedList"),
      taskList: current.isActive("taskList"),
      link: current.isActive("link"),
      codeBlock: current.isActive("codeBlock"),
      table: current.isActive("table"),
      highlightColor: (current.getAttributes("highlight").color ?? null) as EditorColorName | null,
      textColor: (current.getAttributes("textColor").color ?? null) as EditorColorName | null,
    }),
  });

  const tool = (label: MessageKey, isOn: boolean, onPress: () => void, icon: ReactNode) => (
    <button type="button" className={`tool${isOn ? " on" : ""}`} title={translate(label)} aria-label={translate(label)} aria-pressed={isOn}
      onMouseDown={(event) => event.preventDefault()} onClick={onPress}>
      {icon}
    </button>
  );

  const toggleLink = async () => {
    if (editor.isActive("link")) {
      editor.chain().focus().unsetLink().run();
      return;
    }
    const href = await onAskLink();
    if (href) {
      editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
    }
  };

  return (
    <div className="editor-bar">
      {tool("editor.heading", active.heading, () => editor.chain().focus().toggleHeading({ level: 2 }).run(), <Heading size={ICON_SIZE} />)}
      {tool("editor.bold", active.bold, () => editor.chain().focus().toggleBold().run(), <Bold size={ICON_SIZE} />)}
      {tool("editor.italic", active.italic, () => editor.chain().focus().toggleItalic().run(), <Italic size={ICON_SIZE} />)}
      {tool("editor.underline", active.underline, () => editor.chain().focus().toggleUnderline().run(), <Underline size={ICON_SIZE} />)}
      <ColorMenu label="editor.highlight" icon={<Highlighter size={ICON_SIZE} />} appearance="background" selected={active.highlightColor}
        onChoose={(colorName) => (colorName ? editor.chain().focus().setHighlight(colorName).run() : editor.chain().focus().unsetHighlight().run())} />
      <ColorMenu label="editor.textColor" icon={<Baseline size={ICON_SIZE} />} appearance="text" selected={active.textColor}
        onChoose={(colorName) => (colorName ? editor.chain().focus().setTextColor(colorName).run() : editor.chain().focus().unsetTextColor().run())} />
      <span className="tool-separator" />
      {tool("editor.bulletList", active.bulletList, () => editor.chain().focus().toggleBulletList().run(), <List size={ICON_SIZE} />)}
      {tool("editor.orderedList", active.orderedList, () => editor.chain().focus().toggleOrderedList().run(), <ListOrdered size={ICON_SIZE} />)}
      {tool("editor.taskList", active.taskList, () => editor.chain().focus().toggleTaskList().run(), <ListChecks size={ICON_SIZE} />)}
      <span className="tool-separator" />
      {tool("editor.image", false, onPickImage, <ImagePlus size={ICON_SIZE} />)}
      {onCapturePhoto && tool("editor.capturePhoto", false, onCapturePhoto, <Camera size={ICON_SIZE} />)}
      {tool("editor.file", false, onPickFile, <Paperclip size={ICON_SIZE} />)}
      {tool("editor.link", active.link, () => void toggleLink(), <Link size={ICON_SIZE} />)}
      {tool("editor.noteLink", false, onPickNoteLink, <FileSymlink size={ICON_SIZE} />)}
      {tool("editor.code", active.codeBlock, () => editor.chain().focus().toggleCodeBlock().run(), <Code size={ICON_SIZE} />)}
      <TableMenu editor={editor} insideTable={active.table} iconSize={ICON_SIZE} />
      {trailing && <span className="bar-end">{trailing}</span>}
    </div>
  );
}
