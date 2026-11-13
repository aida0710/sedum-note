// スマホの画面の下に出す、取り消し・箇条書きの字下げと移動・本文の書式・表・リンクと、写真・ファイルを添付するボタン。
// スマホのキーボードには Tab も Ctrl+Z も無いので、取り消しと字下げはここから行う。
// PC では、書式は文字を選んだときに出すボタン（SelectionToolbar.tsx）、挿入は「/」から使い、上には NoteTopBar.tsx を置く。

import { type Editor, useEditorState } from "@tiptap/react";
import { ArrowDown, ArrowUp, Camera, Code, FileSymlink, ImagePlus, IndentDecrease, IndentIncrease, List, ListChecks, ListOrdered, Mic, Paperclip, Redo2, Square, Undo2 } from "lucide-react";
import { blockAtCursor, moveBlock } from "./blockOperations";
import { useHorizontalScrollEdges } from "../shared/useHorizontalScrollEdges";
import { useFormattingState } from "./formattingState";
import { TableMenu } from "./TableMenu";
import { LinkTool, TextColorTools, TextStyleTools, TOOL_ICON_SIZE } from "./TextFormattingTools";
import { ToolButton } from "./ToolButton";

// 箇条書き・番号付きの項目と、チェックリストの項目。字下げは、カーソルのあるほうの種類に対して行う。
const LIST_ITEM_TYPES = ["listItem", "taskItem"] as const;

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
  const bar = useHorizontalScrollEdges<HTMLDivElement>();
  // よく使う順に並べる（横に送らないと見えないボタンを、使う回数の少ないものにする）。
  return (
    <div ref={bar} className="editor-bar">
      <HistoryTools editor={editor} />
      <span className="tool-separator" />
      <ListItemTools editor={editor} />
      <ToolButton label="editor.bulletList" isOn={state.bulletList} onPress={() => commands().toggleBulletList().run()}><List size={TOOL_ICON_SIZE} /></ToolButton>
      <ToolButton label="editor.taskList" isOn={state.taskList} onPress={() => commands().toggleTaskList().run()}><ListChecks size={TOOL_ICON_SIZE} /></ToolButton>
      <ToolButton label="editor.orderedList" isOn={state.orderedList} onPress={() => commands().toggleOrderedList().run()}><ListOrdered size={TOOL_ICON_SIZE} /></ToolButton>
      <span className="tool-separator" />
      <TextStyleTools editor={editor} state={state} />
      <TextColorTools editor={editor} state={state} />
      <span className="tool-separator" />
      <ToolButton label="editor.image" isOn={false} onPress={onPickImage}><ImagePlus size={TOOL_ICON_SIZE} /></ToolButton>
      {onCapturePhoto && <ToolButton label="editor.capturePhoto" isOn={false} onPress={onCapturePhoto}><Camera size={TOOL_ICON_SIZE} /></ToolButton>}
      <LinkTool editor={editor} state={state} onAskLink={onAskLink} />
      <ToolButton label="editor.noteLink" isOn={false} onPress={onPickNoteLink}><FileSymlink size={TOOL_ICON_SIZE} /></ToolButton>
      <ToolButton label="editor.file" isOn={false} onPress={onPickFile}><Paperclip size={TOOL_ICON_SIZE} /></ToolButton>
      {onToggleRecording && (
        <ToolButton label={recording ? "editor.stopRecording" : "editor.startRecording"} isOn={recording} onPress={onToggleRecording}>
          {recording ? <Square size={TOOL_ICON_SIZE} /> : <Mic size={TOOL_ICON_SIZE} />}
        </ToolButton>
      )}
      <ToolButton label="editor.code" isOn={state.codeBlock} onPress={() => commands().toggleCodeBlock().run()}><Code size={TOOL_ICON_SIZE} /></ToolButton>
      <TableMenu editor={editor} insideTable={state.table} iconSize={TOOL_ICON_SIZE} />
    </div>
  );
}

// 元に戻す・やり直す。戻すものが無いときは押せない見た目にする。
function HistoryTools({ editor }: { editor: Editor }) {
  const history = useEditorState({
    editor,
    selector: ({ editor: current }) => ({ canUndo: current.can().undo(), canRedo: current.can().redo() }),
  });
  return (
    <>
      <ToolButton label="editor.undo" isOn={false} isUnavailable={!history.canUndo} onPress={() => editor.chain().focus().undo().run()}><Undo2 size={TOOL_ICON_SIZE} /></ToolButton>
      <ToolButton label="editor.redo" isOn={false} isUnavailable={!history.canRedo} onPress={() => editor.chain().focus().redo().run()}><Redo2 size={TOOL_ICON_SIZE} /></ToolButton>
    </>
  );
}

// 箇条書き・チェックリストの中にカーソルがあるときだけ出す、項目の字下げ（Tab・Shift+Tab に当たる）と上下の移動。
function ListItemTools({ editor }: { editor: Editor }) {
  const listItem = useEditorState({
    editor,
    selector: ({ editor: current }) => {
      // チェックリストを箇条書きの中に入れているときは、カーソルのある内側の項目の種類を使う（blockAtCursor はいちばん内側の項目を返す）。
      const blockTypeName = blockAtCursor(current.state)?.node.type.name;
      const type = LIST_ITEM_TYPES.find((itemType) => itemType === blockTypeName) ?? null;
      return { type, canIndent: type !== null && current.can().sinkListItem(type), canOutdent: type !== null && current.can().liftListItem(type) };
    },
  });
  const { type } = listItem;
  if (type === null) {
    return null;
  }
  const moveItem = (direction: -1 | 1) => {
    const block = blockAtCursor(editor.state);
    if (block) {
      moveBlock(editor, block, direction);
    }
  };
  return (
    <>
      <ToolButton label="editor.outdentListItem" isOn={false} isUnavailable={!listItem.canOutdent} onPress={() => editor.chain().focus().liftListItem(type).run()}><IndentDecrease size={TOOL_ICON_SIZE} /></ToolButton>
      <ToolButton label="editor.indentListItem" isOn={false} isUnavailable={!listItem.canIndent} onPress={() => editor.chain().focus().sinkListItem(type).run()}><IndentIncrease size={TOOL_ICON_SIZE} /></ToolButton>
      <ToolButton label="editor.block.moveUp" isOn={false} onPress={() => moveItem(-1)}><ArrowUp size={TOOL_ICON_SIZE} /></ToolButton>
      <ToolButton label="editor.block.moveDown" isOn={false} onPress={() => moveItem(1)}><ArrowDown size={TOOL_ICON_SIZE} /></ToolButton>
      <span className="tool-separator" />
    </>
  );
}
