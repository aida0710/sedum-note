// PC の画面のコマンドパレットで探せるもの（paletteItems.ts の候補）を、いまのメモ・ノートブック・設定・操作から作る。

import { countTags, type NoteSummary } from "../../core/notes/noteQueries";
import type { LiveNotebook } from "../../core/notes/noteRecords";
import { translate } from "../i18n/translate";
import { SETTINGS_PAGE_META } from "../settings/settingsPages";
import type { SettingsSearchEntry } from "../settings/settingsSearchEntries";
import type { AppShortcutId } from "../shortcuts/shortcutCatalog";
import type { PaletteCandidate } from "./paletteItems";
import type { WorkspaceNavigation } from "./useWorkspaceNavigation";

// shortcut は、キーの表記。キーなしにしたものは空。
export type PaletteCommand = { id: AppShortcutId; label: string; shortcut: string; run: () => void };

// パレットを開いてすぐ（何も打つ前）に並べる、よく使う操作。
const SUGGESTED_COMMAND_IDS: AppShortcutId[] = ["newNote", "reminders", "openSettings"];

type PaletteCandidatesInput = {
  summaries: NoteSummary[];
  notebooks: LiveNotebook[];
  settingsEntries: SettingsSearchEntry[];
  commands: PaletteCommand[];
  navigation: WorkspaceNavigation;
};

export function workspacePaletteCandidates({ summaries, notebooks, settingsEntries, commands, navigation }: PaletteCandidatesInput): PaletteCandidate[] {
  const liveSummaries = summaries.filter((summary) => summary.note.content.trashedAt === null);
  const notes: PaletteCandidate[] = liveSummaries.map(({ note, plainText }) => ({
    id: `note:${note.id}`, kind: "note", label: note.content.title || translate("sidebar.untitled"), hint: "",
    extraText: plainText, updatedAt: note.updatedAt, run: () => navigation.openNote(note.id),
  }));
  const notebookCandidates: PaletteCandidate[] = notebooks.map((notebook) => ({
    id: `notebook:${notebook.id}`, kind: "notebook", label: notebook.content.name, hint: "", extraText: "",
    run: () => navigation.selectView({ kind: "notebook", notebookId: notebook.id }),
  }));
  const tags: PaletteCandidate[] = countTags(liveSummaries).map(({ tag }) => ({
    id: `tag:${tag}`, kind: "tag", label: `#${tag}`, hint: "", extraText: "",
    run: () => navigation.selectView({ kind: "tag", tag }),
  }));
  const settings: PaletteCandidate[] = settingsEntries.map((entry) => {
    const pageName = translate(SETTINGS_PAGE_META[entry.page].label);
    const label = translate(entry.label);
    return {
      id: `setting:${entry.page}:${entry.label}`, kind: "setting", label, hint: `${translate("settings.title")} › ${pageName}`,
      extraText: `${translate("settings.title")} ${pageName}`, run: () => navigation.revealSetting(entry.page, label),
    };
  });
  const commandCandidates: PaletteCandidate[] = commands.map((command) => ({
    id: `command:${command.id}`, kind: "command", label: command.label, hint: command.shortcut, extraText: "", run: command.run,
    suggested: SUGGESTED_COMMAND_IDS.includes(command.id),
  }));
  return [...notes, ...notebookCandidates, ...tags, ...settings, ...commandCandidates];
}
