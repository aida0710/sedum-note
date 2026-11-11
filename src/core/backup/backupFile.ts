// バックアップのファイルの形。
//
//   [目印 8 バイト "SEDUMBK1"][ヘッダーの長さ 4 バイト（ビッグエンディアン）][ヘッダー（JSON）][中身]
//
// 中身は、手元に保存してある暗号文（記録と添付）をそのまま順に並べたもの。ヘッダーに、
// パスフレーズで包んだマスターキー（vault.json と同じ文書）と、中身の並びと長さを持つ。
// 暗号文のまま書き出すので、バックアップも作ったときのパスフレーズが無いと読めない。

import { parseVaultDocument, serializeVaultDocument, type VaultDocument } from "../vault/vaultDocument";

const MAGIC = "SEDUMBK1";
const HEADER_LENGTH_BYTES = 4;
const BACKUP_FORMAT_VERSION = 1;
// ヘッダーは記録 1 件あたり 100 バイトほど。壊れたファイルの長さの欄を信じて巨大な領域を取らないための上限。
const MAX_HEADER_BYTES = 64 * 1024 * 1024;

export type BackupEntry = { kind: "record" | "blob"; id: string; sealed: Uint8Array };

export type BackupContents = { vault: VaultDocument; createdAt: string; entries: BackupEntry[] };

type BackupHeader = {
  formatVersion: number;
  createdAt: string;
  vault: string;
  entries: Array<{ kind: "record" | "blob"; id: string; byteLength: number }>;
};

export class InvalidBackupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidBackupError";
  }
}

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

// ファイルに書く順の部品を返す。1 つにつなげないのは、写真の多いバックアップで
// 全体の写しをメモリにもう 1 つ作らないため（保存する側が順に書く）。
export function encodeBackup(contents: BackupContents): Uint8Array[] {
  const header: BackupHeader = {
    formatVersion: BACKUP_FORMAT_VERSION,
    createdAt: contents.createdAt,
    vault: serializeVaultDocument(contents.vault),
    entries: contents.entries.map((entry) => ({ kind: entry.kind, id: entry.id, byteLength: entry.sealed.length })),
  };
  const headerBytes = textEncoder.encode(JSON.stringify(header));
  const prefix = new Uint8Array(MAGIC.length + HEADER_LENGTH_BYTES);
  prefix.set(textEncoder.encode(MAGIC));
  new DataView(prefix.buffer).setUint32(MAGIC.length, headerBytes.length);
  return [prefix, headerBytes, ...contents.entries.map((entry) => entry.sealed)];
}

export function decodeBackup(file: Uint8Array): BackupContents {
  const prefixLength = MAGIC.length + HEADER_LENGTH_BYTES;
  if (file.length < prefixLength || textDecoder.decode(file.subarray(0, MAGIC.length)) !== MAGIC) {
    throw new InvalidBackupError("this is not a backup file");
  }
  const headerLength = new DataView(file.buffer, file.byteOffset, file.byteLength).getUint32(MAGIC.length);
  if (headerLength > MAX_HEADER_BYTES || prefixLength + headerLength > file.length) {
    throw new InvalidBackupError("the backup header is cut short");
  }
  let header: BackupHeader;
  try {
    header = JSON.parse(textDecoder.decode(file.subarray(prefixLength, prefixLength + headerLength))) as BackupHeader;
  } catch {
    throw new InvalidBackupError("the backup header is malformed");
  }
  if (header.formatVersion !== BACKUP_FORMAT_VERSION || !Array.isArray(header.entries) || typeof header.vault !== "string") {
    throw new InvalidBackupError("this backup is of an unsupported version");
  }
  const entries: BackupEntry[] = [];
  let offset = prefixLength + headerLength;
  for (const entry of header.entries) {
    const validEntry = (entry.kind === "record" || entry.kind === "blob") && typeof entry.id === "string" &&
      Number.isInteger(entry.byteLength) && entry.byteLength >= 0 && offset + entry.byteLength <= file.length;
    if (!validEntry) {
      throw new InvalidBackupError("the backup contents are cut short");
    }
    entries.push({ kind: entry.kind, id: entry.id, sealed: file.slice(offset, offset + entry.byteLength) });
    offset += entry.byteLength;
  }
  return { vault: parseVaultDocument(header.vault), createdAt: String(header.createdAt), entries };
}
