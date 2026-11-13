// そのときだけ要るボタン。カーソルが表の中にある間は表のメニューを、録音している間は録音を止めるボタンを出す。
// PC のメモの上のバー（NoteTopBar.tsx）と、ズームしている間の上の行（戻るボタンの右）に置く。

import { type Editor, useEditorState } from "@tiptap/react";
import { Square } from "lucide-react";
import { translate } from "../i18n/translate";
import { TableMenu } from "./TableMenu";
import { TOOL_ICON_SIZE } from "./TextFormattingTools";

// 録音を止めるボタンの、四角の大きさ（px）。文字（12px）に合わせる。
const STOP_ICON_SIZE = 12;

type NoteContextToolsProps = {
  editor: Editor;
  recording: boolean;
  // 録音を止めて添付する。
  onStopRecording?: () => void;
};

export function NoteContextTools({ editor, recording, onStopRecording }: NoteContextToolsProps) {
  const insideTable = useEditorState({ editor, selector: ({ editor: current }) => current.isActive("table") });
  return (
    <>
      {insideTable && <TableMenu editor={editor} insideTable iconSize={TOOL_ICON_SIZE} />}
      {recording && onStopRecording && (
        <button type="button" className="recording-stop" onMouseDown={(event) => event.preventDefault()} onClick={onStopRecording}>
          <Square size={STOP_ICON_SIZE} fill="currentColor" />{translate("editor.stopRecording")}
        </button>
      )}
    </>
  );
}
