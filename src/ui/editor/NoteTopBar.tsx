// PC のメモの上のバー。ふだんは右端のボタン（目次・お気に入り・「…」）だけを出し、書式のボタンは並べない
// （書式は文字を選んだときに出す SelectionToolbar.tsx、挿入は「/」から使う）。
// カーソルが表の中にある間は表のメニューを、録音している間は録音を止めるボタンを、左に出す。

import { type Editor, useEditorState } from "@tiptap/react";
import { Square } from "lucide-react";
import type { ReactNode } from "react";
import { translate } from "../i18n/translate";
import { TableMenu } from "./TableMenu";
import { TOOL_ICON_SIZE } from "./TextFormattingTools";

type NoteTopBarProps = {
  editor: Editor;
  recording: boolean;
  // 録音を止めて添付する。
  onStopRecording?: () => void;
  // 右端に出すボタン。
  trailing: ReactNode;
};

export function NoteTopBar({ editor, recording, onStopRecording, trailing }: NoteTopBarProps) {
  const insideTable = useEditorState({ editor, selector: ({ editor: current }) => current.isActive("table") });
  return (
    <div className="editor-bar note-top-bar">
      {insideTable && <TableMenu editor={editor} insideTable iconSize={TOOL_ICON_SIZE} />}
      {recording && onStopRecording && (
        <button type="button" className="recording-stop" onMouseDown={(event) => event.preventDefault()} onClick={onStopRecording}>
          <Square size={12} fill="currentColor" />{translate("editor.stopRecording")}
        </button>
      )}
      <span className="bar-end">{trailing}</span>
    </div>
  );
}
