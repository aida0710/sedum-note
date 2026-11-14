// チェックリストの項目のチェックを押したら（付けても外しても）、短く振動させる（Android のアプリだけ。platform/hapticFeedback.ts）。
// チェックボックスは TaskItem の node view が作り、その change で項目の checked を書き換える。change は本文の要素まで
// 上がってくるので、そこで受ける。編集できない本文（ゴミ箱の中）では、node view がチェックを戻すので振動させない。

import { Extension } from "@tiptap/core";
import { Plugin } from "@tiptap/pm/state";
import { giveHapticFeedback } from "../platform/hapticFeedback";

// TaskItem の node view が、項目の li に付ける属性（チェックの有無）。チェックボックスの持ち主の項目を見分けるのに使う。
const TASK_ITEM_SELECTOR = "li[data-checked]";

export const TaskCheckHapticFeedback = Extension.create({
  name: "taskCheckHapticFeedback",

  addProseMirrorPlugins() {
    const { editor } = this;
    return [
      new Plugin({
        props: {
          handleDOMEvents: {
            change: (_view, event) => {
              const target = event.target;
              if (editor.isEditable && target instanceof HTMLInputElement && target.type === "checkbox" && target.closest(TASK_ITEM_SELECTOR)) {
                giveHapticFeedback();
              }
              return false;
            },
          },
        },
      }),
    ];
  },
});
