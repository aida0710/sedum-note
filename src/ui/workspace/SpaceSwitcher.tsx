// 左の列の上の、スペースの切り替え。スペースが 2 つ以上あるときだけ出す。足す・消すなどは「設定」で行う。

import { Check, ChevronsUpDown } from "lucide-react";
import { useState } from "react";
import { translate } from "../i18n/translate";
import { spaceDisplayName } from "../session/spaceDisplayName";
import { selectSpace, useSpaceRegistry } from "../session/spaceRegistry";
import { PopupMenu } from "../shared/PopupMenu";

export function SpaceSwitcher() {
  const { spaces, activeSpaceId } = useSpaceRegistry();
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const activeSpace = spaces.find((space) => space.id === activeSpaceId);
  if (spaces.length < 2 || !activeSpace) {
    return null;
  }
  return (
    <>
      <button type="button" className="space-switcher" aria-haspopup="menu" aria-label={translate("space.switchFrom", { name: spaceDisplayName(activeSpace) })}
        onClick={(event) => setMenuAnchor(event.currentTarget)}>
        <span className="nav-label">{spaceDisplayName(activeSpace)}</span><ChevronsUpDown size={13} />
      </button>
      {menuAnchor && (
        <PopupMenu anchor={menuAnchor} onClose={() => setMenuAnchor(null)}>
          <div className="menu-heading">{translate("settings.spaces")}</div>
          {spaces.map((space) => (
            <button key={space.id} className="menu-item" role="menuitemradio" aria-checked={space.id === activeSpaceId}
              onClick={() => { setMenuAnchor(null); selectSpace(space.id); }}>
              <span className="nav-label">{spaceDisplayName(space)}</span>
              {space.id === activeSpaceId && <Check size={15} className="menu-check" />}
            </button>
          ))}
        </PopupMenu>
      )}
    </>
  );
}
