// 本文の書式と、写真を貼るボタン。PC では本文の上、スマホでは画面の下に出す。

import { type Editor, useEditorState } from "@tiptap/react";
import { Bold, Code, Heading, ImagePlus, Italic, Link, List, ListChecks, ListOrdered, Underline } from "lucide-react";
import { type ReactNode, useRef } from "react";
import { translate, type MessageKey } from "../i18n/translate";
import { imageFilesOf } from "./imageFiles";

type EditorToolbarProps = {
  editor: Editor;
  onImageFiles: (files: File[]) => void;
  // リンク先を聞く。やめたら null。
  onAskLink: () => Promise<string | null>;
  trailing?: ReactNode;
};

const ICON_SIZE = 16;

export function EditorToolbar({ editor, onImageFiles, onAskLink, trailing }: EditorToolbarProps) {
  const imageInput = useRef<HTMLInputElement>(null);
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

  const pickFiles = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = imageFilesOf(event.target.files);
    event.target.value = "";
    if (files.length > 0) {
      onImageFiles(files);
    }
  };

  return (
    <div className="editor-bar">
      {tool("editor.heading", active.heading, () => editor.chain().focus().toggleHeading({ level: 2 }).run(), <Heading size={ICON_SIZE} />)}
      {tool("editor.bold", active.bold, () => editor.chain().focus().toggleBold().run(), <Bold size={ICON_SIZE} />)}
      {tool("editor.italic", active.italic, () => editor.chain().focus().toggleItalic().run(), <Italic size={ICON_SIZE} />)}
      {tool("editor.underline", active.underline, () => editor.chain().focus().toggleUnderline().run(), <Underline size={ICON_SIZE} />)}
      <span className="tool-separator" />
      {tool("editor.bulletList", active.bulletList, () => editor.chain().focus().toggleBulletList().run(), <List size={ICON_SIZE} />)}
      {tool("editor.orderedList", active.orderedList, () => editor.chain().focus().toggleOrderedList().run(), <ListOrdered size={ICON_SIZE} />)}
      {tool("editor.taskList", active.taskList, () => editor.chain().focus().toggleTaskList().run(), <ListChecks size={ICON_SIZE} />)}
      <span className="tool-separator" />
      {tool("editor.image", false, () => imageInput.current?.click(), <ImagePlus size={ICON_SIZE} />)}
      {tool("editor.link", active.link, () => void toggleLink(), <Link size={ICON_SIZE} />)}
      {tool("editor.code", active.codeBlock, () => editor.chain().focus().toggleCodeBlock().run(), <Code size={ICON_SIZE} />)}
      <input ref={imageInput} type="file" accept="image/*" multiple hidden onChange={pickFiles} />
      {trailing && <span className="bar-end">{trailing}</span>}
    </div>
  );
}
