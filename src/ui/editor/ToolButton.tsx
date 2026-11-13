// 書式・挿入のボタン（.tool）。押しても本文の選択とカーソルを動かさない（押す前に本文からフォーカスを奪わない）。

import type { ReactNode } from "react";
import { translate, type MessageKey } from "../i18n/translate";

type ToolButtonProps = { label: MessageKey; isOn: boolean; onPress: () => void; children: ReactNode };

export function ToolButton({ label, isOn, onPress, children }: ToolButtonProps) {
  return (
    <button type="button" className={`tool${isOn ? " on" : ""}`} title={translate(label)} aria-label={translate(label)} aria-pressed={isOn}
      onMouseDown={(event) => event.preventDefault()} onClick={onPress}>
      {children}
    </button>
  );
}
