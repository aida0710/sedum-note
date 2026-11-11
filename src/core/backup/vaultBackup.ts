// このデバイスのメモ・ノートブック・添付を 1 つのバックアップに書き出す・バックアップから戻す。

import { newRandomId } from "../crypto/randomId";
import type { LocalStore } from "../local/localStore";
import type { NoteRepository } from "../notes/noteRepository";
import { BODY_SCHEMA_VERSION, ensureBodySchemaSupported } from "../notes/bodySchema";
import { unlockVault, type VaultDocument } from "../vault/vaultDocument";
import { type BackupEntry, decodeBackup, encodeBackup } from "./backupFile";

export type BackupExport = {
  // ファイルに書く順の部品。
  parts: Uint8Array[];
  noteCount: number;
  // 同期先から取れず、バックアップに入らなかった添付の数（このデバイスで一度も開いていないもの）。
  missingAttachmentCount: number;
};

export async function exportBackup(localStore: LocalStore, repository: NoteRepository, now: Date): Promise<BackupExport> {
  await repository.flush();
  const vault = await localStore.readSetting<VaultDocument>("vault");
  if (!vault) {
    throw new Error("there is no vault to back up");
  }
  // 添付は開いたときに同期先から取るので、手元に無いものを先に取っておく。
  let missingAttachmentCount = 0;
  const attachmentIds = new Set(repository.notes().flatMap((note) => note.content.attachments.map((attachment) => attachment.id)));
  const entries: BackupEntry[] = (await localStore.listRecordEntries()).map((entry) => ({ kind: "record", id: entry.id, sealed: entry.sealed }));
  for (const id of attachmentIds) {
    if (!(await localStore.getBlob(id))) {
      await repository.readAttachment(id).catch(() => null);
    }
    const blob = await localStore.getBlob(id);
    if (blob) {
      entries.push({ kind: "blob", id, sealed: blob.sealed });
    } else {
      missingAttachmentCount += 1;
    }
  }
  return {
    parts: encodeBackup({ vault, createdAt: now.toISOString(), entries }),
    noteCount: repository.notes().length,
    missingAttachmentCount,
  };
}

// 空のデバイスに、バックアップの中身を入れる。パスフレーズが違えば WrongPassphraseError を投げ、何も書かない。
// 同期の設定は入れない（戻したあとで「設定」から足す）。記録はすべて「送っていない」にするので、
// あとで同期先を足すと、同期先の内容とマージされる。
export async function restoreBackup(localStore: LocalStore, file: Uint8Array, passphrase: string): Promise<void> {
  const contents = decodeBackup(file);
  await unlockVault(contents.vault, passphrase);
  // 手元に書く前に確かめる（新しいアプリのバックアップを書いてから断ると、開けない vault が残る）。
  ensureBodySchemaSupported(contents.vault.bodySchema, BODY_SCHEMA_VERSION);
  await localStore.clearEverything();
  await localStore.writeSetting("vault", contents.vault);
  // 項目の書き込みはデバイスの ID ごとに持つので、このデバイスの ID をここで決めて保存する。
  await localStore.writeSetting("deviceId", newRandomId());
  for (const entry of contents.entries) {
    if (entry.kind === "record") {
      await localStore.putRecordEntry({ id: entry.id, sealed: entry.sealed, remoteEtag: null, waitingForPush: true });
    } else {
      await localStore.putBlob({ id: entry.id, sealed: entry.sealed, uploaded: false });
    }
  }
}
