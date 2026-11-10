// 1 件の記録（メモ・ノートブック）を表す Yjs の文書の形。
//
//   fields（Y.Map）   タイトル・ピン留め・ノートブックへの所属など。項目ごとに「新しい方」を取る
//   body（XmlFragment）メモの本文。エディタ（Tiptap）が直接読み書きし、文字の単位でマージされる
//
// Y.Map にそのまま書くと、同時の書き込みは時刻ではなくクライアント ID の大小で決まる。
// 「あとに書いた方」を残すため、項目の値を「項目名|デバイス ID」のキーにデバイスごとに書き、
// 読むときに時刻のいちばん新しいものを選ぶ。デバイスは自分のキーにしか書かないので、
// 同時の書き込みで値が消えることがない。

import * as Y from "yjs";

export type RecordKind = "note" | "notebook";

type FieldEntry = { value: unknown; at: string };

const FIELDS_MAP = "fields";
const BODY_FRAGMENT = "body";
const KEY_SEPARATOR = "|";

// 文書を変えた出どころ。NoteRepository が、保存と同期の要否を分けるのに使う。
// 同期で取り込んだ変更。
export const REMOTE_ORIGIN = "remote";
// 項目（fields）への書き込み。
export const FIELD_ORIGIN = "field";

export function recordFields(doc: Y.Doc): Y.Map<FieldEntry> {
  return doc.getMap<FieldEntry>(FIELDS_MAP);
}

export function recordBody(doc: Y.Doc): Y.XmlFragment {
  return doc.getXmlFragment(BODY_FRAGMENT);
}

function latestEntry(doc: Y.Doc, name: string): { entry: FieldEntry; deviceId: string } | undefined {
  const prefix = name + KEY_SEPARATOR;
  let latest: { entry: FieldEntry; deviceId: string } | undefined;
  for (const [key, entry] of recordFields(doc)) {
    if (!key.startsWith(prefix)) {
      continue;
    }
    const deviceId = key.slice(prefix.length);
    // 同じ時刻なら、デバイス ID の大きい方。どのデバイスでも同じ結果になればよい。
    if (!latest || entry.at > latest.entry.at || (entry.at === latest.entry.at && deviceId > latest.deviceId)) {
      latest = { entry, deviceId };
    }
  }
  return latest;
}

export function readField<Value>(doc: Y.Doc, name: string): Value | undefined {
  return latestEntry(doc, name)?.entry.value as Value | undefined;
}

export type FieldWriter = { deviceId: string; now: Date };

// 項目を書く。時計が遅れているデバイスの書き込みが、見えている値より古い扱いに
// ならないよう、時刻は「今」と「見えている最新の 1 ミリ秒あと」の遅い方にする。
export function writeField(doc: Y.Doc, name: string, value: unknown, writer: FieldWriter): void {
  const seen = latestEntry(doc, name)?.entry.at;
  let at = writer.now.toISOString();
  if (seen !== undefined && seen >= at) {
    at = new Date(new Date(seen).getTime() + 1).toISOString();
  }
  doc.transact(() => {
    recordFields(doc).set(name + KEY_SEPARATOR + writer.deviceId, { value, at });
  }, FIELD_ORIGIN);
}

// 項目名（デバイス ID を除いた部分）の一覧。ノートブックへの所属のように、名前に ID を含む項目を探すのに使う。
export function fieldNames(doc: Y.Doc): Set<string> {
  const names = new Set<string>();
  for (const key of recordFields(doc).keys()) {
    names.add(key.slice(0, key.lastIndexOf(KEY_SEPARATOR)));
  }
  return names;
}

// 記録がいちばん最近変えられた時刻（どの項目でも）。
export function latestFieldTime(doc: Y.Doc): string {
  let latest = "";
  for (const entry of recordFields(doc).values()) {
    if (entry.at > latest) {
      latest = entry.at;
    }
  }
  return latest;
}

export function encodeRecordState(doc: Y.Doc): Uint8Array {
  return Y.encodeStateAsUpdate(doc);
}

export function recordDocumentFromState(state: Uint8Array): Y.Doc {
  const doc = new Y.Doc();
  Y.applyUpdate(doc, state, REMOTE_ORIGIN);
  return doc;
}
