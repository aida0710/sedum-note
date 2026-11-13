// コマンドパレットに並べる、開いているメモ・タブ・同期への操作。キーは無く、メモの「…」やタブの右クリックのメニューに
// 届かないとき（キーボードだけで操作しているとき）にも、パレットから行えるようにする。

import type { LiveNote } from "../../core/notes/noteRecords";
import type { NoteRepository } from "../../core/notes/noteRepository";
import { type MessageKey, translate } from "../i18n/translate";
import type { WorkspaceNavigation } from "./useWorkspaceNavigation";
import type { PaletteCommand } from "./workspacePaletteCandidates";

type OpenNoteCommandsInput = {
  // 開いているメモ。設定やグラフのタブを開いているときは undefined。
  note: LiveNote | undefined;
  navigation: WorkspaceNavigation;
  repository: NoteRepository;
  // 取り消せる知らせつきで、ゴミ箱に入れる（useTrashWithUndo）。
  moveToTrash: (noteIds: string[]) => Promise<void>;
  // 今すぐ同期する。同期を設定していなければ null。
  syncNow: (() => void) | null;
};

const withoutShortcut = (id: string, label: string, run: () => void): PaletteCommand => ({ id, label, shortcut: "", run });

export function openNoteCommands({ note, navigation, repository, moveToTrash, syncNow }: OpenNoteCommandsInput): PaletteCommand[] {
  const { activeTab } = navigation;
  const noteCommand = (id: string, action: MessageKey, run: () => void) => withoutShortcut(id, translate("palette.openNoteCommand", { action: translate(action) }), run);
  const noteCommands = note === undefined || note.content.trashedAt !== null ? [] : [
    noteCommand("toggleBookmark", note.content.bookmarked ? "editor.unbookmark" : "editor.bookmark", () => void repository.updateNote(note.id, { bookmarked: !note.content.bookmarked })),
    noteCommand("togglePin", note.content.pinned ? "editor.unpin" : "editor.pin", () => void repository.updateNote(note.id, { pinned: !note.content.pinned })),
    noteCommand("openInSplit", "split.open", () => navigation.openInSplit(note.id)),
    noteCommand("moveToTrash", "editor.moveToTrash", () => void moveToTrash([note.id])),
  ];
  const tabCommands = activeTab === null ? [] : [
    withoutShortcut("togglePinnedTab", translate(navigation.pinnedTabs.includes(activeTab) ? "tabs.unpin" : "tabs.pin"), () => navigation.togglePinnedTab(activeTab)),
    withoutShortcut("closeOtherTabs", translate("tabs.closeOthers"), () => navigation.closeOtherTabs(activeTab)),
  ];
  const syncCommands = syncNow === null ? [] : [withoutShortcut("syncNow", translate("settings.syncNow"), syncNow)];
  return [...noteCommands, ...tabCommands, ...syncCommands];
}
