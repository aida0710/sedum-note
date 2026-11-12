// プラグインのコマンドを、開いているメモに対して実行する。宣言で「読む」としたものだけを渡し、返ってきた指示のうち、
// 「書く」としたものだけを、メモに当てる。

import type { Editor, JSONContent } from "@tiptap/react";
import { type InstalledPlugin, sha256Hex } from "../../core/plugins/installedPlugins";
import { parsePluginResult, pluginInput, type PluginResult } from "../../core/plugins/pluginRun";
import type { LiveNote } from "../../core/notes/noteRecords";
import type { NoteRepository } from "../../core/notes/noteRepository";
import { languageInUse } from "../i18n/languageInUse";
import { appendMarkdownToBody } from "../markdown/appendMarkdown";
import { ATTACHMENT_HREF_PREFIX, bodyToMarkdown, type MarkdownImportContext, writeMarkdownToBody } from "../markdown/markdownDocument";
import { runPluginModule } from "./runPluginModule";

export class PluginChangedError extends Error {
  constructor() {
    super("the stored plugin module does not match the one that was installed");
    this.name = "PluginChangedError";
  }
}

type PluginCommandInput = {
  plugin: InstalledPlugin;
  commandId: string;
  note: LiveNote;
  editor: Editor;
  repository: NoteRepository;
};

// プラグインが返す Markdown を、本文に入れるときの決まり。添付は、このメモか、ほかのメモにもう貼ってあるものだけを指せる
// （プラグインは、新しいファイルを持ち込めない）。外の画像や埋め込みは、リンクの文字になる（開いただけでは、外へ通信しない）。
function importContextOf(repository: NoteRepository): MarkdownImportContext {
  return {
    noteExists: (noteId) => repository.note(noteId) !== undefined,
    attachFile: async (href) => {
      if (!href.startsWith(ATTACHMENT_HREF_PREFIX)) {
        return null;
      }
      const attachmentId = href.slice(ATTACHMENT_HREF_PREFIX.length);
      const attachment = repository.notes().flatMap((note) => note.content.attachments).find((candidate) => candidate.id === attachmentId);
      return attachment ? { attachmentId, fileName: attachment.fileName, mimeType: attachment.mimeType, byteLength: attachment.byteLength } : null;
    },
  };
}

// 選択と置き換える文字を、本文に入れる形にする。Markdown としては読まない（選択した文字は書式なしで渡すので、返すのも
// 書式なしの文字）。1 行ならその行の途中に入れ、2 行以上なら、行ごとに段落にする。
function textAsContent(text: string): JSONContent | JSONContent[] {
  const lines = text.split("\n");
  const textNode = (line: string): JSONContent => ({ type: "text", text: line });
  if (lines.length === 1) {
    return text === "" ? [] : textNode(text);
  }
  return lines.map((line) => (line === "" ? { type: "paragraph" } : { type: "paragraph", content: [textNode(line)] }));
}

async function applyPluginResult(result: PluginResult, { note, editor, repository }: Pick<PluginCommandInput, "note" | "editor" | "repository">): Promise<void> {
  const context = importContextOf(repository);
  if (result.replaceBody !== undefined) {
    // 本文の全部を置き換える前の状態を、履歴に残す（取り消しと別に、あとからでも戻せる）。
    await repository.captureVersionBeforeReplace(note.id);
    await writeMarkdownToBody(result.replaceBody, note.body, context);
  }
  if (result.replaceSelection !== undefined) {
    editor.chain().insertContent(textAsContent(result.replaceSelection)).run();
    // メニューを閉じると、フォーカスはメニューを開いたボタンに戻っている。続けて打てる・取り消せるように、その場で本文へ移す
    // （Tiptap の focus は、次の描画まで待つ）。
    editor.view.focus();
  }
  if (result.append !== undefined) {
    await appendMarkdownToBody(result.append, note.body, context);
  }
  if (result.setTitle !== undefined) {
    await repository.updateNote(note.id, { title: result.setTitle });
  }
}

// コマンドを実行して、メモに当てる。利用者に見せる知らせがあれば、それを返す。
export async function runPluginCommand({ plugin, commandId, note, editor, repository }: PluginCommandInput): Promise<string | null> {
  // 手元に置いたモジュールが、取り込んだときのものと同じかを確かめる。
  if (await sha256Hex(plugin.moduleBytes) !== plugin.moduleSha256) {
    throw new PluginChangedError();
  }
  // 保存を待っている入力を書いてから読む（プラグインに渡す本文を、手元の保存と同じにする）。
  await repository.flush();
  const { doc, selection } = editor.state;
  const input = pluginInput(plugin.manifest, commandId, {
    title: note.content.title,
    markdown: bodyToMarkdown(note.body, {
      attachmentHref: ({ id }) => ATTACHMENT_HREF_PREFIX + id,
      noteTitle: (linkedNoteId) => repository.note(linkedNoteId)?.content.title ?? null,
    }),
    selection: selection.empty ? "" : doc.textBetween(selection.from, selection.to, "\n"),
  }, languageInUse());
  const result = parsePluginResult(plugin.manifest, await runPluginModule(plugin.moduleBytes, input));
  await applyPluginResult(result, { note, editor, repository });
  return result.message ?? null;
}
