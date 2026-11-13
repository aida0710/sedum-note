// コマンドパレットに並べる、メモの外の操作（ノートブックを追加する、スペースを切り替える）。どちらもキーは無く、
// 左の列の「＋」とスペースの切り替えのメニューと同じことを、パレットからも行えるようにする。

import type { NoteRepository } from "../../core/notes/noteRepository";
import { translate } from "../i18n/translate";
import { spaceDisplayName } from "../session/spaceDisplayName";
import { selectSpace, type Space } from "../session/spaceRegistry";
import type { Dialogs } from "../shared/DialogProvider";
import { withoutShortcut } from "./openNoteCommands";
import type { WorkspaceNavigation } from "./useWorkspaceNavigation";
import type { PaletteCommand } from "./workspacePaletteCandidates";

type WorkspaceCommandsInput = {
  repository: NoteRepository;
  navigation: WorkspaceNavigation;
  dialogs: Dialogs;
  // 切り替えられるスペース。メモを 1 つだけ開いた別のウィンドウでは、スペースを切り替えないので空にする。
  spaces: Space[];
  currentSpaceId: string;
};

export function workspaceCommands({ repository, navigation, dialogs, spaces, currentSpaceId }: WorkspaceCommandsInput): PaletteCommand[] {
  // 作ったノートブックを開いて見せる（左の列の「＋」で作ったときと同じ所に並ぶ）。
  const addNotebook = async () => {
    const name = (await dialogs.prompt({ message: translate("sidebar.newNotebookPlaceholder"), confirmLabel: translate("common.create") }))?.trim();
    if (name) {
      navigation.selectView({ kind: "notebook", notebookId: (await repository.createNotebook(name)).id });
    }
  };
  const spaceCommands = spaces
    .filter((space) => space.id !== currentSpaceId)
    .map((space) => withoutShortcut(`switchSpace:${space.id}`, translate("palette.switchSpace", { name: spaceDisplayName(space) }), () => selectSpace(space.id)));
  return [withoutShortcut("addNotebook", translate("sidebar.newNotebook"), () => void addNotebook()), ...spaceCommands];
}
