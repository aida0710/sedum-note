// スマホの画面の下に出す、本文の書式・表・リンクと、写真・ファイルを添付するボタン。
// PC では、書式は文字を選んだときに出すボタン（SelectionToolbar.tsx）、挿入は「/」から使い、上には NoteTopBar.tsx を置く。

import type { Editor } from "@tiptap/react";
import { Camera, Code, FileSymlink, ImagePlus, List, ListChecks, ListOrdered, Mic, Paperclip, Square } from "lucide-react";
import { useFormattingState } from "./formattingState";
import { TableMenu } from "./TableMenu";
import { LinkTool, TextColorTools, TextStyleTools, TOOL_ICON_SIZE } from "./TextFormattingTools";
import { ToolButton } from "./ToolButton";

type EditorToolbarProps = {
  editor: Editor;
  // 写真・ファイルを選ぶ画面を開く。
  onPickImage: () => void;
  onPickFile: () => void;
  // カメラを開いて、その場で撮る。
  onCapturePhoto?: () => void;
  // 録音を始める・止める。録音できない環境では渡さない。
  onToggleRecording?: () => void;
  recording: boolean;
  // リンク先を聞く。やめたら null。
  onAskLink: () => Promise<string | null>;
  // リンクするメモを選ぶ画面を開く。
  onPickNoteLink: () => void;
};

export function EditorToolbar({ editor, onPickImage, onPickFile, onCapturePhoto, onToggleRecording, recording, onAskLink, onPickNoteLink }: EditorToolbarProps) {
  const state = useFormattingState(editor);
  const commands = () => editor.chain().focus();
  return (
    <div className="editor-bar">
      <TextStyleTools editor={editor} state={state} />
      <TextColorTools editor={editor} state={state} />
      <span className="tool-separator" />
      <ToolButton label="editor.bulletList" isOn={state.bulletList} onPress={() => commands().toggleBulletList().run()}><List size={TOOL_ICON_SIZE} /></ToolButton>
      <ToolButton label="editor.orderedList" isOn={state.orderedList} onPress={() => commands().toggleOrderedList().run()}><ListOrdered size={TOOL_ICON_SIZE} /></ToolButton>
      <ToolButton label="editor.taskList" isOn={state.taskList} onPress={() => commands().toggleTaskList().run()}><ListChecks size={TOOL_ICON_SIZE} /></ToolButton>
      <span className="tool-separator" />
      <ToolButton label="editor.image" isOn={false} onPress={onPickImage}><ImagePlus size={TOOL_ICON_SIZE} /></ToolButton>
      {onCapturePhoto && <ToolButton label="editor.capturePhoto" isOn={false} onPress={onCapturePhoto}><Camera size={TOOL_ICON_SIZE} /></ToolButton>}
      <ToolButton label="editor.file" isOn={false} onPress={onPickFile}><Paperclip size={TOOL_ICON_SIZE} /></ToolButton>
      {onToggleRecording && (
        <ToolButton label={recording ? "editor.stopRecording" : "editor.startRecording"} isOn={recording} onPress={onToggleRecording}>
          {recording ? <Square size={TOOL_ICON_SIZE} /> : <Mic size={TOOL_ICON_SIZE} />}
        </ToolButton>
      )}
      <LinkTool editor={editor} state={state} onAskLink={onAskLink} />
      <ToolButton label="editor.noteLink" isOn={false} onPress={onPickNoteLink}><FileSymlink size={TOOL_ICON_SIZE} /></ToolButton>
      <ToolButton label="editor.code" isOn={state.codeBlock} onPress={() => commands().toggleCodeBlock().run()}><Code size={TOOL_ICON_SIZE} /></ToolButton>
      <TableMenu editor={editor} insideTable={state.table} iconSize={TOOL_ICON_SIZE} />
    </div>
  );
}
