// PC の画面の並び（開いているタブ、ピン留め、選んでいるタブ、設定で開いているページ、左の列で開け閉めした行）。ロックと解除、再読み込み、
// アプリの開き直しのあとに同じ並びへ戻すために手元に残す。
// メモやノートブックの ID とタグの名前が入るので、マスターキーで暗号化して置く。ロックしている間は、手元にも平文で残らない。
// このデバイスのこのスペースだけのもので、同期もバックアップもしない。

import { open, seal } from "../crypto/sealedBox";
import type { LocalStore } from "../local/localStore";

const WORKSPACE_LAYOUT_BINDING = "settings:workspaceLayout";
const WORKSPACE_LAYOUT_NAME = "sealedWorkspaceLayout";
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export type WorkspaceLayout = {
  openTabs: string[];
  pinnedTabs: string[];
  activeTab: string | null;
  // 設定のタブで開いているページの名前（ui/settings/settingsPages.ts）。まだ選んでいなければ null。
  settingsPage: string | null;
  // 利用者が開け閉めした左の列の行（行のキー → 開いているか）。開け閉めしていない行は入らない。
  expandedRows: Record<string, boolean>;
};

// まだ残していなければ null。
export async function readWorkspaceLayout(localStore: LocalStore, masterKey: CryptoKey): Promise<WorkspaceLayout | null> {
  const sealed = await localStore.readSetting<Uint8Array>(WORKSPACE_LAYOUT_NAME);
  if (!sealed) {
    return null;
  }
  return JSON.parse(textDecoder.decode(await open(masterKey, sealed, WORKSPACE_LAYOUT_BINDING))) as WorkspaceLayout;
}

export async function writeWorkspaceLayout(localStore: LocalStore, masterKey: CryptoKey, layout: WorkspaceLayout): Promise<void> {
  await localStore.writeSetting(WORKSPACE_LAYOUT_NAME, await seal(masterKey, textEncoder.encode(JSON.stringify(layout)), WORKSPACE_LAYOUT_BINDING));
}
