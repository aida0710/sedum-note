// 文字の書式のボタン。見出し・太字・斜体・下線（TextStyleTools）と、ハイライト・文字色（TextColorTools）。
// スマホの下のツールバー（EditorToolbar.tsx）と、PC で文字を選んだときに出すボタン（SelectionToolbar.tsx）で同じものを使う。

import type { Editor } from "@tiptap/react";
import { Baseline, Bold, Heading, Highlighter, Italic, Link, Underline } from "lucide-react";
import { ColorMenu } from "./ColorMenu";
import type { FormattingState } from "./formattingState";
import { ToolButton } from "./ToolButton";

// ツールバーのアイコンの大きさ。
export const TOOL_ICON_SIZE = 16;

type TextFormattingToolsProps = { editor: Editor; state: FormattingState };

export function TextStyleTools({ editor, state }: TextFormattingToolsProps) {
  return (
    <>
      <ToolButton label="editor.heading" isOn={state.heading} onPress={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}><Heading size={TOOL_ICON_SIZE} /></ToolButton>
      <ToolButton label="editor.bold" isOn={state.bold} onPress={() => editor.chain().focus().toggleBold().run()}><Bold size={TOOL_ICON_SIZE} /></ToolButton>
      <ToolButton label="editor.italic" isOn={state.italic} onPress={() => editor.chain().focus().toggleItalic().run()}><Italic size={TOOL_ICON_SIZE} /></ToolButton>
      <ToolButton label="editor.underline" isOn={state.underline} onPress={() => editor.chain().focus().toggleUnderline().run()}><Underline size={TOOL_ICON_SIZE} /></ToolButton>
    </>
  );
}

export function TextColorTools({ editor, state }: TextFormattingToolsProps) {
  return (
    <>
      <ColorMenu label="editor.highlight" icon={<Highlighter size={TOOL_ICON_SIZE} />} appearance="background" selected={state.highlightColor}
        onChoose={(colorName) => (colorName ? editor.chain().focus().setHighlight(colorName).run() : editor.chain().focus().unsetHighlight().run())} />
      <ColorMenu label="editor.textColor" icon={<Baseline size={TOOL_ICON_SIZE} />} appearance="text" selected={state.textColor}
        onChoose={(colorName) => (colorName ? editor.chain().focus().setTextColor(colorName).run() : editor.chain().focus().unsetTextColor().run())} />
    </>
  );
}

type LinkToolProps = TextFormattingToolsProps & {
  // リンク先を聞く。やめたら null。
  onAskLink: () => Promise<string | null>;
};

// リンクを付ける・外すボタン。リンクの上なら外し、そうでなければリンク先を聞いて付ける。
export function LinkTool({ editor, state, onAskLink }: LinkToolProps) {
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
  return <ToolButton label="editor.link" isOn={state.link} onPress={() => void toggleLink()}><Link size={TOOL_ICON_SIZE} /></ToolButton>;
}
