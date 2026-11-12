// この画面が開いているスペース（spaceRegistry.ts）の ID を、画面の部品に渡す。メモを 1 つだけ開く別のウィンドウでは、
// そのウィンドウのスペース（ほかのウィンドウで切り替えても変わらない）。

import { createContext, useContext } from "react";
import { FIRST_SPACE_ID } from "./spaceRegistry";

export const CurrentSpaceIdContext = createContext<string>(FIRST_SPACE_ID);

export function useCurrentSpaceId(): string {
  return useContext(CurrentSpaceIdContext);
}
