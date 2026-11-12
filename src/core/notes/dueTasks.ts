// 本文のチェックリストの項目のうち、期限の印（dueTimes.ts）が付いたものを読む・完了にする。
// エディタのライブラリを通さずに本文（Yjs の XmlFragment）を読むので、一覧と通知から使える。

import * as Y from "yjs";
import { nodePlainText } from "./bodyText";
import { findDueMark } from "./dueTimes";

const TASK_ITEM_NODE = "taskItem";

export type DueTask = {
  // 項目を見分ける名前（Yjs がその項目に付けた ID）。項目を動かしても、文字を書き換えても変わらず、中身を含まない。
  itemKey: string;
  // 本文の中で、上から何番目のチェックリストの項目か（期限の無い項目も数える）。
  taskIndex: number;
  // 項目の 1 行目の文字から、期限の印を除いたもの。
  text: string;
  dueAt: string;
  done: boolean;
};

function taskItemsOf(body: Y.XmlFragment): Y.XmlElement[] {
  const taskItems: Y.XmlElement[] = [];
  const visit = (node: Y.XmlFragment | Y.XmlElement) => {
    if (node instanceof Y.XmlElement && node.nodeName === TASK_ITEM_NODE) {
      taskItems.push(node);
    }
    for (const child of node.toArray()) {
      if (child instanceof Y.XmlElement) {
        visit(child);
      }
    }
  };
  visit(body);
  return taskItems;
}

// 項目の 1 行目（子の項目を含まない）の文字。
function firstLineText(taskItem: Y.XmlElement): string {
  const firstLine = taskItem.get(0);
  return firstLine instanceof Y.XmlElement ? nodePlainText(firstLine) : "";
}

function dueTaskOf(taskItem: Y.XmlElement, taskIndex: number): DueTask | null {
  const line = firstLineText(taskItem);
  const mark = findDueMark(line);
  if (!mark) {
    return null;
  }
  const text = `${line.slice(0, mark.start)}${line.slice(mark.end)}`.replace(/\s+/g, " ").trim();
  const yjsId = taskItem._item?.id;
  const itemKey = yjsId ? `${yjsId.client.toString(36)}-${yjsId.clock.toString(36)}` : String(taskIndex);
  return { itemKey, taskIndex, text, dueAt: mark.dueAt, done: taskItem.getAttribute("checked") as unknown === true };
}

export function bodyDueTasks(body: Y.XmlFragment): DueTask[] {
  return taskItemsOf(body).map(dueTaskOf).filter((task) => task !== null);
}

// 一覧から、項目のチェックを付ける・外す。一覧を出したあとに本文が変わって、その位置の項目が別のものになっていたら、
// 何もしないで false を返す。
export function setDueTaskDone(body: Y.XmlFragment, task: Pick<DueTask, "taskIndex" | "text" | "dueAt">, done: boolean): boolean {
  const taskItem = taskItemsOf(body)[task.taskIndex];
  const current = taskItem ? dueTaskOf(taskItem, task.taskIndex) : null;
  if (!taskItem || !current || current.text !== task.text || current.dueAt !== task.dueAt) {
    return false;
  }
  // 属性は ProseMirror の JSON と同じ形（真偽値のまま）で入れる。
  taskItem.setAttribute("checked", done as unknown as string);
  return true;
}
