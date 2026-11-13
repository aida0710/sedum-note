// PC のメモの上のバー。ふだんは右端のボタン（目次・お気に入り・「…」）だけを出し、書式のボタンは並べない
// （書式は文字を選んだときに出す SelectionToolbar.tsx、挿入は「/」から使う）。
// 表の中にいる間の表のメニューと、録音している間の止めるボタンは、左に出す（NoteContextTools.tsx）。

import type { Editor } from "@tiptap/react";
import type { ReactNode } from "react";
import { NoteContextTools } from "./NoteContextTools";

type NoteTopBarProps = {
  editor: Editor;
  recording: boolean;
  // 録音を止めて添付する。
  onStopRecording?: () => void;
  // 右端に出すボタン。
  trailing: ReactNode;
};

export function NoteTopBar({ editor, recording, onStopRecording, trailing }: NoteTopBarProps) {
  return (
    <div className="editor-bar note-top-bar">
      <NoteContextTools editor={editor} recording={recording} onStopRecording={onStopRecording} />
      <span className="bar-end">{trailing}</span>
    </div>
  );
}
