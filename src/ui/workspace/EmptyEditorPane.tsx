// タブを 1 つも開いていないときの、本文の欄。案内の文だけで終わらせず、新しいメモを作るボタンと、キーを添える。

import { Plus } from "lucide-react";
import type { NoteView } from "../../core/notes/noteQueries";
import { translate } from "../i18n/translate";
import { useDevicePreferences } from "../preferences/devicePreferences";
import { shortcutTextOf } from "../shortcuts/shortcutBindings";

type EmptyEditorPaneProps = {
  // 左の列で選んでいる一覧。
  view: NoteView;
  // ゴミ箱にメモがあるか。
  trashHasNotes: boolean;
  onCreateNote: () => void;
};

export function EmptyEditorPane({ view, trashHasNotes, onCreateNote }: EmptyEditorPaneProps) {
  const { shortcutOverrides } = useDevicePreferences();
  // 空のゴミ箱を選んでいるときは、選ぶメモも無いので、そのことだけを言う。
  if (view.kind === "trash" && !trashHasNotes) {
    return <div className="empty-state">{translate("editor.emptyTrash")}</div>;
  }
  const newNote = shortcutTextOf("newNote", shortcutOverrides);
  const commandPalette = shortcutTextOf("commandPalette", shortcutOverrides);
  return (
    <div className="empty-state">
      <p>{translate("editor.empty")}</p>
      <button type="button" className="primary-button" onClick={onCreateNote}><Plus size={16} />{translate("editor.emptyCreateNote")}</button>
      {/* キーを外している（設定の「ショートカット」）ときは、キーの案内を出さない。 */}
      {newNote !== null && commandPalette !== null && <p className="hint">{translate("editor.emptyShortcuts", { newNote, commandPalette })}</p>}
    </div>
  );
}
