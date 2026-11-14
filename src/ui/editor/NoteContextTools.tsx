// そのときだけ要るボタン。カーソルが表の中にある間は表のメニューを、録音している間は録音を止めるボタンを出す。
// PC のメモの上のバー（NoteTopBar.tsx）と、ズームしている間の上の行（戻るボタンの右）に置く。

import { type Editor, useEditorState } from "@tiptap/react";
import { Square } from "lucide-react";
import { translate } from "../i18n/translate";
import { TableMenu } from "./TableMenu";
import { ICON_SIZE } from "../shared/iconSizes";

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
      {insideTable && <TableMenu editor={editor} insideTable />}
      {recording && onStopRecording && (
        <button type="button" className="recording-stop" onMouseDown={(event) => event.preventDefault()} onClick={onStopRecording}>
          <Square size={ICON_SIZE.chip} fill="currentColor" />{translate("editor.stopRecording")}
        </button>
      )}
    </>
  );
}
