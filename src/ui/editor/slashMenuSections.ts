// 「/」のメニューに並べる候補を、見出しの付いたまとまりに分ける。
// 打つ前（「/」だけ）は「最近使った」と、まとまり（基本・ブロック…）ごとの見出しを付ける。
// 絞り込みを始めたら、見出しを外して 1 列にする（当たった候補だけを、一覧の順で）。

import { RECENT_SLASH_COMMAND_LIMIT } from "./recentSlashCommands";
import { SLASH_COMMAND_GROUPS, type SlashCommand, type SlashCommandGroup } from "./slashCommands";

export type SlashMenuHeading = "recent" | SlashCommandGroup;

export type SlashMenuSection = {
  // 見出し。絞り込んでいる間は null（見出しを出さない）。
  heading: SlashMenuHeading | null;
  commands: SlashCommand[];
};

type SlashMenuSectionsInput = {
  // 候補に出せるもの（絞り込んだあと）。
  commands: SlashCommand[];
  query: string;
  // 最近選んだ候補の ID（新しい順）。
  recentCommandIds: string[];
};

export function slashMenuSections({ commands, query, recentCommandIds }: SlashMenuSectionsInput): SlashMenuSection[] {
  if (query.trim() !== "") {
    return commands.length === 0 ? [] : [{ heading: null, commands }];
  }
  const recent = recentCommandIds
    .map((id) => commands.find((command) => command.id === id))
    .filter((command) => command !== undefined)
    .slice(0, RECENT_SLASH_COMMAND_LIMIT);
  const groups: SlashMenuSection[] = SLASH_COMMAND_GROUPS
    .map((group) => ({ heading: group, commands: commands.filter((command) => command.group === group) }))
    .filter((section) => section.commands.length > 0);
  return recent.length === 0 ? groups : [{ heading: "recent", commands: recent }, ...groups];
}
