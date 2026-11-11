// MCP の窓口の設定（有効か、トークン、完全な削除を許すか）。トークンを知っていればメモを読めるので、
// マスターキーで暗号化して手元に置く。ロックしている間は、手元にも平文のトークンが無い。
// このデバイスだけの設定で、同期もバックアップもしない。

import { newRandomId } from "../crypto/randomId";
import { open, seal } from "../crypto/sealedBox";
import type { LocalStore } from "../local/localStore";

const MCP_SETTINGS_BINDING = "settings:mcp";
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export type McpSettings = {
  enabled: boolean;
  // MCP のクライアントが Authorization: Bearer に入れる値。
  token: string;
  // 完全な削除（元に戻せない）のツールを出すか。
  allowPermanentDelete: boolean;
};

// 128 ビットの乱数を 2 つつなげた 256 ビット。
export function newMcpToken(): string {
  return newRandomId() + newRandomId();
}

// まだ設定していなければ、無効で、新しいトークンを持つ設定を返す（保存はしない）。
export async function readMcpSettings(localStore: LocalStore, masterKey: CryptoKey): Promise<McpSettings> {
  const sealed = await localStore.readSetting<Uint8Array>("sealedMcpSettings");
  if (!sealed) {
    return { enabled: false, token: newMcpToken(), allowPermanentDelete: false };
  }
  return JSON.parse(textDecoder.decode(await open(masterKey, sealed, MCP_SETTINGS_BINDING))) as McpSettings;
}

export async function writeMcpSettings(localStore: LocalStore, masterKey: CryptoKey, settings: McpSettings): Promise<void> {
  await localStore.writeSetting("sealedMcpSettings", await seal(masterKey, textEncoder.encode(JSON.stringify(settings)), MCP_SETTINGS_BINDING));
}
