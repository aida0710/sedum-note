// 「/」のメニューの「最近使った」。選んだ候補を、このデバイスだけに新しい順で残す（devicePreferences。同期しない）。

import { readDevicePreferences, updateDevicePreferences } from "../preferences/devicePreferences";
import { TEMPLATE_COMMAND_ID_PREFIX } from "./slashCommands";

// 「最近使った」に出す数。メニューを開いた直後に、その下の「基本」の候補まで見えるようにする。
export const RECENT_SLASH_COMMAND_LIMIT = 5;

export function rememberSlashCommand(commandId: string): void {
  // テンプレートの候補の ID にはメモの ID が入るので、暗号化しない場所には残さない。
  if (commandId.startsWith(TEMPLATE_COMMAND_ID_PREFIX)) {
    return;
  }
  const others = readDevicePreferences().recentSlashCommandIds.filter((id) => id !== commandId);
  updateDevicePreferences({ recentSlashCommandIds: [commandId, ...others].slice(0, RECENT_SLASH_COMMAND_LIMIT) });
}
