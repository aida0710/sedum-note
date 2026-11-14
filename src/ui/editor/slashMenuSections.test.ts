import { describe, expect, it } from "vitest";
import { filterSlashCommands, type SlashCommandActions } from "./slashCommands";
import { slashMenuSections } from "./slashMenuSections";

const actions: SlashCommandActions = {
  pickImage: () => undefined, pickFile: () => undefined, pickNoteLink: () => undefined, pickBlockLink: () => undefined, pickBlockEmbed: () => undefined,
  scanDocument: () => undefined, pickTaskDue: () => undefined, templates: [{ id: "note-1", title: "日報" }], insertTemplate: () => undefined,
};

const sectionsFor = (query: string, recentCommandIds: string[]) =>
  slashMenuSections({ commands: filterSlashCommands(query, actions), query, recentCommandIds });

describe("「/」のメニューのまとまり", () => {
  it("打つ前は、まとまりごとに見出しを付け、基本・ブロック・メディア・挿入・リンク・テンプレートの順に並べる", () => {
    expect(sectionsFor("", []).map((section) => section.heading)).toEqual(["basic", "blocks", "media", "insert", "links", "templates"]);
  });

  it("最近使った候補があれば先頭に新しい順で 5 件まで出し、候補に無い ID は飛ばす", () => {
    const [recent] = sectionsFor("", ["table", "gone", "heading2", "taskList", "image", "embed", "divider"]);
    expect(recent?.heading).toBe("recent");
    expect(recent?.commands.map((command) => command.id)).toEqual(["table", "heading2", "taskList", "image", "embed"]);
  });

  it("絞り込みを始めたら、見出しを外して当たった候補だけを 1 列にする", () => {
    // 試験は Node で動くので、画面の言語に依らない英語の言葉で絞り込む。
    const sections = sectionsFor("heading", ["table"]);
    expect(sections).toHaveLength(1);
    expect(sections[0]?.heading).toBeNull();
    expect(sections[0]?.commands.map((command) => command.id)).toEqual(["heading1", "heading2", "heading3", "heading4", "heading5", "heading6"]);
  });

  it("当たる候補が無ければ、まとまりも無い", () => {
    expect(sectionsFor("zzzz", [])).toEqual([]);
  });
});
