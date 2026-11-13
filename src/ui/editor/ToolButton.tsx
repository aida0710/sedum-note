// 書式・挿入のボタン（.tool）。押しても本文の選択とカーソルを動かさない（押す前に本文からフォーカスを奪わない）。

import type { ReactNode } from "react";
import { translate, type MessageKey } from "../i18n/translate";

type ToolButtonProps = {
  label: MessageKey;
  isOn: boolean;
  onPress: () => void;
  // 今は押しても何も起きない（戻す操作が無い、など）。disabled 属性にすると押したときに本文からフォーカスが外れ、
  // スマホではキーボードが閉じるので、aria-disabled で伝えて押したときだけ何もしない。
  isUnavailable?: boolean;
  children: ReactNode;
};

export function ToolButton({ label, isOn, onPress, isUnavailable = false, children }: ToolButtonProps) {
  return (
    <button type="button" className={`tool${isOn ? " on" : ""}`} title={translate(label)} aria-label={translate(label)} aria-pressed={isOn}
      aria-disabled={isUnavailable || undefined}
      onMouseDown={(event) => event.preventDefault()} onClick={isUnavailable ? undefined : onPress}>
      {children}
    </button>
  );
}
