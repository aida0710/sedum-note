// 本文で「/」を打つと、ブロックの候補を出す。候補の表示は SlashMenu.tsx が行う。

import { Extension } from "@tiptap/core";
import { PluginKey } from "@tiptap/pm/state";
import { Suggestion } from "@tiptap/suggestion";
import { filterSlashCommands, type SlashCommand } from "./slashCommands";
import type { SlashMenuController } from "./slashMenuController";

// 候補を出す文字。日本語の入力のままでも出せるよう、全角の「／」でも出す。
const SLASH_CHARACTERS = ["/", "／"];

export const SlashCommands = Extension.create<{ controller: SlashMenuController | null }>({
  name: "slashCommands",
  addOptions() {
    return { controller: null };
  },
  addProseMirrorPlugins() {
    const { controller } = this.options;
    if (controller === null) {
      return [];
    }
    return SLASH_CHARACTERS.map((character, index) => Suggestion<SlashCommand, SlashCommand>({
      editor: this.editor,
      char: character,
      pluginKey: new PluginKey(`slashCommands-${index}`),
      // コードの中の「/」では出さない。
      allow: ({ state, range }) => state.doc.resolve(range.from).parent.type.name !== "codeBlock",
      items: ({ query }) => filterSlashCommands(query),
      command: ({ editor, range, props: command }) => {
        // 打った「/」と絞り込みの文字を消してから、選んだブロックにする。
        editor.chain().focus().deleteRange(range).run();
        command.run(editor, controller.actions);
      },
      render: () => {
        const show = (props: { items: SlashCommand[]; clientRect?: (() => DOMRect | null) | null; command: (command: SlashCommand) => void }) => {
          const anchor = props.clientRect?.() ?? null;
          if (anchor === null || props.items.length === 0) {
            controller.hide();
          } else {
            controller.show({ commands: props.items, anchor, choose: props.command });
          }
        };
        return {
          onStart: show,
          onUpdate: show,
          onExit: () => controller.hide(),
          onKeyDown: ({ event }) => {
            if (controller.state() === null) {
              return false;
            }
            if (event.key === "Escape") {
              controller.hide();
              return true;
            }
            return controller.handleKey?.(event) ?? false;
          },
        };
      },
    }));
  },
});
