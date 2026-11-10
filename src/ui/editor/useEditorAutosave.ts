// エディタの自動保存。打ち終わって少し待ってからまとめて保存し、画面を離れる・
// アプリを裏へ回すときは待たずに保存する。
//
// エディタが最後に読んだタイトルと本文（base）を覚えておき、保存のときに比べる。
// 打っている間に同期でほかのデバイスの編集が届いていたら、上書きせずに競合コピーにする。

import { useEffect, useRef } from "react";
import type { LiveNote } from "../../core/notes/noteRecords";
import type { EditorBase, NoteRepository } from "../../core/notes/noteRepository";

// 打ち終わってからこれだけ待って保存する。毎打鍵の暗号化と書き込みを避ける。
const SAVE_DELAY_MILLISECONDS = 500;

export type EditorChanges = { title?: string; document?: unknown };

type EditorAutosaveInput = {
  repository: NoteRepository;
  noteId: string;
  initialBase: EditorBase;
  // 競合コピーにしたあと、エディタの表示を同期先の内容へ戻すのに使う。
  onKeptAsCopy: (current: LiveNote, copy: LiveNote) => void;
};

export type EditorAutosave = {
  schedule: (changes: EditorChanges) => void;
  hasPendingChanges: () => boolean;
  // 同期で届いた内容をエディタへ入れたときに呼ぶ。
  adoptStoredContent: (base: EditorBase) => void;
};

export function useEditorAutosave({ repository, noteId, initialBase, onKeptAsCopy }: EditorAutosaveInput): EditorAutosave {
  const pending = useRef<EditorChanges>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const base = useRef<EditorBase>(initialBase);
  const onKeptAsCopyRef = useRef(onKeptAsCopy);
  onKeptAsCopyRef.current = onKeptAsCopy;

  const flush = useRef(async () => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    const changes = pending.current;
    pending.current = {};
    if (Object.keys(changes).length === 0 || !repository.note(noteId)) {
      return;
    }
    const outcome = await repository.saveEditorChanges(noteId, changes, base.current);
    if (outcome.kind === "saved") {
      base.current = { title: outcome.note.content.title, document: outcome.note.content.document };
      return;
    }
    base.current = { title: outcome.note.content.title, document: outcome.note.content.document };
    onKeptAsCopyRef.current(outcome.note, outcome.copy);
  }).current;

  useEffect(() => {
    const saveWhenHidden = () => {
      if (document.visibilityState === "hidden") {
        void flush();
      }
    };
    document.addEventListener("visibilitychange", saveWhenHidden);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", saveWhenHidden);
      window.removeEventListener("pagehide", flush);
      void flush();
    };
  }, [flush]);

  // 毎回同じものを返し、使う側の effect が描画のたびに流れないようにする。
  return useRef<EditorAutosave>({
    schedule: (changes) => {
      pending.current = { ...pending.current, ...changes };
      if (timer.current !== null) {
        clearTimeout(timer.current);
      }
      timer.current = setTimeout(() => void flush(), SAVE_DELAY_MILLISECONDS);
    },
    hasPendingChanges: () => timer.current !== null,
    adoptStoredContent: (stored) => {
      base.current = stored;
    },
  }).current;
}
