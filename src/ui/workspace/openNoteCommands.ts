// コマンドパレットに並べる、開いているメモ・タブ・同期への操作。キーは無く、メモの「…」やタブの右クリックのメニューに
// 届かないとき（キーボードだけで操作しているとき）にも、パレットから行えるようにする。
// 名前を聞く操作（名前の変更）は、メモの題の欄ではなく 1 行の入力のダイアログで聞く。

import type { LiveNote } from "../../core/notes/noteRecords";
import type { NoteRepository } from "../../core/notes/noteRepository";
import { type MessageKey, translate } from "../i18n/translate";
import { canOpenNoteWindows, openNoteInNewWindow } from "../platform/noteWindows";
import { isPrintAvailable, printPage } from "../platform/printPage";
import type { Dialogs } from "../shared/DialogProvider";
import type { WorkspaceNavigation } from "./useWorkspaceNavigation";
import type { PaletteCommand } from "./workspacePaletteCandidates";

type OpenNoteCommandsInput = {
  // 開いているメモ。設定やグラフのタブを開いているときは undefined。
  note: LiveNote | undefined;
  navigation: WorkspaceNavigation;
  repository: NoteRepository;
  dialogs: Dialogs;
  // このウィンドウのスペース（別のウィンドウで開くときに渡す）。
  spaceId: string;
  // 取り消せる知らせつきで、ゴミ箱に入れる（useTrashWithUndo）。
  moveToTrash: (noteIds: string[]) => Promise<void>;
  // 今すぐ同期する。同期を設定していなければ null。
  syncNow: (() => void) | null;
  // 別のウィンドウで開く・印刷に失敗したときに知らせる。
  onActionFailed: (error: unknown) => void;
};

export const withoutShortcut = (id: string, label: string, run: () => void): PaletteCommand => ({ id, label, shortcut: "", run });

export function openNoteCommands({ note, navigation, repository, dialogs, spaceId, moveToTrash, syncNow, onActionFailed }: OpenNoteCommandsInput): PaletteCommand[] {
  const { activeTab } = navigation;
  const noteCommand = (id: string, action: MessageKey, run: () => unknown) =>
    withoutShortcut(id, translate("palette.openNoteCommand", { action: translate(action) }), () => void run());
  const noteCommands = note === undefined || note.content.trashedAt !== null ? [] : [
    noteCommand("toggleBookmark", note.content.bookmarked ? "editor.unbookmark" : "editor.bookmark", () => repository.updateNote(note.id, { bookmarked: !note.content.bookmarked })),
    noteCommand("togglePin", note.content.pinned ? "editor.unpin" : "editor.pin", () => repository.updateNote(note.id, { pinned: !note.content.pinned })),
    noteCommand("renameNote", "notebook.rename", async () => {
      const title = await dialogs.prompt({ title: translate("notebook.rename"), message: translate("editor.titlePlaceholder"), confirmLabel: translate("common.save"), initialValue: note.content.title });
      if (title !== null && title.trim() !== note.content.title) {
        await repository.updateNote(note.id, { title: title.trim() });
      }
    }),
    noteCommand("duplicateNote", "editor.duplicate", async () => {
      const title = translate("editor.duplicateTitle", { title: note.content.title || translate("sidebar.untitled") });
      navigation.openNote((await repository.duplicateNote(note.id, title)).id);
    }),
    noteCommand("toggleTemplate", note.content.isTemplate ? "editor.stopBeingTemplate" : "editor.makeTemplate",
      () => repository.updateNote(note.id, { isTemplate: !note.content.isTemplate, pinned: false })),
    noteCommand("openInSplit", "split.open", () => navigation.openInSplit(note.id)),
    ...(canOpenNoteWindows() ? [noteCommand("openInNewWindow", "window.openInNewWindow",
      () => openNoteInNewWindow({ noteId: note.id, spaceId, title: note.content.title || translate("sidebar.untitled") }).catch(onActionFailed))] : []),
    ...(isPrintAvailable() ? [noteCommand("print", "editor.print", () => printPage().catch(onActionFailed))] : []),
    noteCommand("moveToTrash", "editor.moveToTrash", () => moveToTrash([note.id])),
  ];
  const tabCommands = activeTab === null ? [] : [
    withoutShortcut("togglePinnedTab", translate(navigation.pinnedTabs.includes(activeTab) ? "tabs.unpin" : "tabs.pin"), () => navigation.togglePinnedTab(activeTab)),
    withoutShortcut("closeOtherTabs", translate("tabs.closeOthers"), () => navigation.closeOtherTabs(activeTab)),
    withoutShortcut("closeTabsToRight", translate("tabs.closeToRight"), () => navigation.closeTabsToRight(activeTab)),
  ];
  const syncCommands = syncNow === null ? [] : [withoutShortcut("syncNow", translate("settings.syncNow"), syncNow)];
  return [...noteCommands, ...tabCommands, ...syncCommands];
}
