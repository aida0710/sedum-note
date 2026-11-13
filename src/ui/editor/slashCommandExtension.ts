// 本文で「/」を打つと、ブロックの候補を出す。候補の表示は SlashMenu.tsx が行う。

import { Extension } from "@tiptap/core";
import { PluginKey } from "@tiptap/pm/state";
import { Suggestion } from "@tiptap/suggestion";
import { filterSlashCommands, type SlashCommand } from "./slashCommands";
import type { SlashMenuController } from "./slashMenuController";
import { isImeKeyEvent } from "../shared/imeKeyEvent";

// 候補を出す文字。日本語の入力のままでも出せるよう、全角の「／」でも出す。
const SLASH_CHARACTERS = ["/", "／"];
// 絞り込みの文字の中にあれば、候補を探しているのではなく、パスを打っていると見なす文字。
const PATH_SEPARATOR = "/";

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
      items: ({ query }) => filterSlashCommands(query, controller.actions),
      command: ({ editor, range, props: command }) => {
        // 打った「/」と絞り込みの文字を消してから、選んだブロックにする。
        editor.chain().focus().deleteRange(range).run();
        command.run(editor, controller.actions);
      },
      render: () => {
        const show = (props: { items: SlashCommand[]; query: string; clientRect?: (() => DOMRect | null) | null; command: (command: SlashCommand) => void }) => {
          const anchor = props.clientRect?.() ?? null;
          // 当たる候補が無いときは「見つかりません」を出す（SlashMenu.tsx）。「/usr/local」のようなパスを打っている間は、何も出さない。
          const typingPath = props.items.length === 0 && props.query.includes(PATH_SEPARATOR);
          if (anchor === null || typingPath) {
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
            // 変換中のキー（候補を選ぶ矢印、確定の Enter、やめる Escape）は、メニューの操作にしない。
            if (controller.state() === null || isImeKeyEvent(event)) {
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
