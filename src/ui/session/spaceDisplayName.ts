// スペースの、画面に出す名前。名前を付けていないスペース（スペースを足す前からある、最初のスペース）は、決まった呼び名で出す。

import { translate } from "../i18n/translate";
import type { Space } from "./spaceRegistry";

export function spaceDisplayName(space: Space): string {
  return space.name || translate("space.unnamed");
}
