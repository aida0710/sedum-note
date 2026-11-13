// ツールバーの、色を選ぶボタン（ハイライト、文字色）。押すと色の見本が開く。

import type { ReactNode } from "react";
import { useState } from "react";
import { translate, type MessageKey } from "../i18n/translate";
import { PopupMenu } from "../shared/PopupMenu";
import { ColorChoices } from "./ColorChoices";
import type { EditorColorName } from "./editorColors";

type ColorMenuProps = {
  label: MessageKey;
  icon: ReactNode;
  appearance: "background" | "text";
  // いまカーソルのある所に付いている色。付いていなければ null。
  selected: EditorColorName | null;
  onChoose: (colorName: EditorColorName | null) => void;
};

export function ColorMenu({ label, icon, appearance, selected, onChoose }: ColorMenuProps) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  return (
    <>
      <button type="button" className={`tool${selected ? " on" : ""}`} title={translate(label)} aria-label={translate(label)} aria-haspopup="menu"
        onMouseDown={(event) => event.preventDefault()} onClick={(event) => setAnchor(anchor ? null : event.currentTarget)}>
        {icon}
      </button>
      {anchor && (
        <PopupMenu anchor={anchor} onClose={() => setAnchor(null)} takesFocus={false}>
          <ColorChoices appearance={appearance} selected={selected} onChoose={(colorName) => { setAnchor(null); onChoose(colorName); }} />
        </PopupMenu>
      )}
    </>
  );
}
