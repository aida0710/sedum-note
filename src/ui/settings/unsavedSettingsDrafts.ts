// 設定の、まだ保存していない打ちかけ（カスタム CSS、作りかけのテーマ、同期先の入力、AI の接続先と API キー、
// プラグインの取り込み元）。打ちかけは設定の画面の中にだけあり、ほかのページやタブへ移ると画面ごと消えるので、
// 打ちかけを持つ欄が useUnsavedSettingsDraft で知らせ、移る側（設定のページの切り替え、設定のタブから離れる操作）が
// runAfterConfirmingDraftDiscard で、捨ててよいかを聞いてから移る（プロパティのダイアログを閉じるときと同じ形）。

import { useEffect } from "react";
import { translate } from "../i18n/translate";
import type { Dialogs } from "../shared/DialogProvider";

// 打ちかけを持っている欄の名前。
const draftOwners = new Set<string>();

export function useUnsavedSettingsDraft(owner: string, hasDraft: boolean): void {
  useEffect(() => {
    if (!hasDraft) {
      return undefined;
    }
    draftOwners.add(owner);
    return () => {
      draftOwners.delete(owner);
    };
  }, [owner, hasDraft]);
}

// 打ちかけが無ければ、すぐ移る。あれば、捨てて移ってよいかを聞き、よいと答えたときだけ移る。
export function runAfterConfirmingDraftDiscard(confirm: Dialogs["confirm"], move: () => void): void {
  if (draftOwners.size === 0) {
    move();
    return;
  }
  void confirm({ message: translate("settings.unsavedDraftsConfirm"), confirmLabel: translate("settings.discardDrafts"), danger: true }).then((accepted) => {
    if (accepted) {
      move();
    }
  });
}
