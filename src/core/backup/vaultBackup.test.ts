import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { newRandomId } from "../crypto/randomId";
import { IndexedDbLocalStore } from "../local/indexedDbLocalStore";
import { appendAttachmentFile, appendParagraph } from "../notes/bodyFixtures";
import { bodyPlainText } from "../notes/bodyText";
import { MemoryObjectStore } from "../remote/memoryObjectStore";
import { WrongPassphraseError } from "../vault/vaultDocument";
import { readVaultState, unlockLocalVault, type VaultSessionEnvironment } from "../vault/vaultSession";
import { connectSyncedRemote, createLocalVault, joinSyncedVault } from "../vault/vaultTestDevices";
import { InvalidBackupError } from "./backupFile";
import { exportBackup, restoreBackup } from "./vaultBackup";

const PASSPHRASE = "correct horse battery";
const remoteConfig = { endpoint: "https://s3.example.com", bucket: "notes", region: "auto", prefix: "", accessKeyId: "k", secretAccessKey: "s" };

function environment(store = new MemoryObjectStore()): VaultSessionEnvironment {
  return { localStore: new IndexedDbLocalStore(`backup-${newRandomId()}`), createObjectStore: () => store };
}

function joinParts(parts: Uint8Array[]): Uint8Array {
  const file = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    file.set(part, offset);
    offset += part.length;
  }
  return file;
}

async function deviceWithNoteAndFile() {
  const source = environment();
  const vault = await createLocalVault(source, PASSPHRASE);
  const notebook = await vault.repository.createNotebook("仕事");
  const note = await vault.repository.createNote({ title: "議事録", notebookIds: [notebook.id], pinned: true });
  appendParagraph(note.body, "決まったこと");
  const fileBytes = Uint8Array.from({ length: 50_000 }, (_, index) => index % 251);
  const attachment = await vault.repository.storeAttachment({ bytes: fileBytes, mimeType: "application/pdf", fileName: "資料.pdf" });
  appendAttachmentFile(note.body, attachment);
  const backup = await exportBackup(source.localStore, vault.repository, new Date("2026-11-11T00:00:00Z"));
  return { backup, note, attachment, fileBytes };
}

describe("バックアップ", () => {
  it("書き出したバックアップを空のデバイスに戻すと、メモ・ノートブック・添付のファイルが同じ中身で戻る", async () => {
    const { backup, note, attachment, fileBytes } = await deviceWithNoteAndFile();
    expect(backup).toMatchObject({ noteCount: 1, missingAttachmentCount: 0 });

    const target = environment();
    await restoreBackup(target.localStore, joinParts(backup.parts), PASSPHRASE);
    const restored = await unlockLocalVault(target, PASSPHRASE);
    expect(restored.repository.notebooks().map((item) => item.content.name)).toEqual(["仕事"]);
    const restoredNote = restored.repository.note(note.id)!;
    expect(restoredNote.content).toMatchObject({ title: "議事録", pinned: true });
    expect(bodyPlainText(restoredNote.body)).toBe("決まったこと");
    expect(restoredNote.content.attachments).toEqual([attachment]);
    expect(await restored.repository.readAttachment(attachment.id)).toEqual(fileBytes);
  });

  it("バックアップには、タイトルも本文もファイル名も平文で入らない", async () => {
    const source = environment();
    const vault = await createLocalVault(source, PASSPHRASE);
    const note = await vault.repository.createNote({ title: "secret-title" });
    appendParagraph(note.body, "secret-body");
    appendAttachmentFile(note.body, await vault.repository.storeAttachment({ bytes: new Uint8Array([1]), mimeType: "text/plain", fileName: "secret-name.txt" }));
    const backup = await exportBackup(source.localStore, vault.repository, new Date());
    expect(new TextDecoder("latin1").decode(joinParts(backup.parts))).not.toMatch(/secret/);
  });

  it("パスフレーズが違うと戻さず、デバイスは空のまま", async () => {
    const { backup } = await deviceWithNoteAndFile();
    const target = environment();
    await expect(restoreBackup(target.localStore, joinParts(backup.parts), "a different phrase")).rejects.toBeInstanceOf(WrongPassphraseError);
    expect(await readVaultState(target.localStore)).toBe("absent");
  });

  it("バックアップでないファイルや、途中で切れたファイルは断る", async () => {
    const { backup } = await deviceWithNoteAndFile();
    const file = joinParts(backup.parts);
    const target = environment();
    await expect(restoreBackup(target.localStore, new TextEncoder().encode("just some text file"), PASSPHRASE)).rejects.toBeInstanceOf(InvalidBackupError);
    await expect(restoreBackup(target.localStore, file.slice(0, file.length - 100), PASSPHRASE)).rejects.toBeInstanceOf(InvalidBackupError);
  });

  it("戻したあとで同期先を足すと、戻したメモと添付がほかのデバイスに届く", async () => {
    const { backup, note, attachment, fileBytes } = await deviceWithNoteAndFile();
    const store = new MemoryObjectStore();
    const target = environment(store);
    await restoreBackup(target.localStore, joinParts(backup.parts), PASSPHRASE);
    const connected = await connectSyncedRemote(target, await unlockLocalVault(target, PASSPHRASE), { passphrase: PASSPHRASE, remoteConfig });
    await connected.syncEngine!.syncOnce();

    const other = await joinSyncedVault(environment(store), { passphrase: PASSPHRASE, remoteConfig });
    await other.syncEngine!.syncOnce();
    expect(other.repository.note(note.id)?.content.title).toBe("議事録");
    expect(await other.repository.readAttachment(attachment.id)).toEqual(fileBytes);
  });
});
