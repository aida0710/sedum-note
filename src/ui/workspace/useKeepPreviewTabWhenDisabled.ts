// 設定で仮のタブを使わないようにしているとき（previewTabs が false）、残っている仮のタブを普通のタブにする。
// 設定を切った時点で開いていた仮のタブと、前に開いていたタブを戻したときの仮のタブが、もう入れ替わらないのに斜体のまま残らないように。

import { useEffect } from "react";

type KeepPreviewTabWhenDisabledInput = {
  previewTabs: boolean;
  previewTab: string | null;
  keepPreviewTab: (tabId: string) => void;
};

export function useKeepPreviewTabWhenDisabled({ previewTabs, previewTab, keepPreviewTab }: KeepPreviewTabWhenDisabledInput): void {
  useEffect(() => {
    if (!previewTabs && previewTab !== null) {
      keepPreviewTab(previewTab);
    }
  }, [previewTabs, previewTab, keepPreviewTab]);
}
