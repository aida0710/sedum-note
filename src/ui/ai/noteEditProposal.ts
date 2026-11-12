// AI が出した、開いているメモの直しの案。AI は直したあとの本文の全体を Markdown で返すので、今の本文と
// ブロックごとに比べて差分にし、変わったブロックだけを入れ替える（直していないブロックの、Markdown に無い書式や
// ブロックの ID を落とさない）。

import type { Editor, JSONContent } from "@tiptap/core";
import { documentBlocksToMarkdown, type BodyExportContext, type MarkdownImportContext, markdownToBodyBlocks } from "../markdown/markdownDocument";
import { type BlockHunk, diffBlocks } from "./blockDiff";

// 案を作ったあとで本文が変わっていて、案のとおりには入れ替えられない。
export class StaleNoteEditError extends Error {
  constructor() {
    super("the note changed after the edit was proposed");
    this.name = "StaleNoteEditError";
  }
}

export type NoteEditProposal = {
  noteId: string;
  summary: string;
  // 案を作ったとき（AI に頼んだとき）の本文の、ブロックごとの Markdown。適用する前に、今の本文と比べる。
  baseBlocks: string[];
  // 直したあとの本文のブロックと、その Markdown（差分を見せるのに使う）。
  newBlocks: JSONContent[];
  newBlockMarkdowns: string[];
  hunks: BlockHunk[];
};

type ProposalInput = {
  noteId: string;
  summary: string;
  // AI が返した、直したあとの本文の全体。
  markdown: string;
  // AI に頼んだときの本文（エディタの文書）。
  baseDocument: JSONContent;
  exportContext: BodyExportContext;
  importContext: MarkdownImportContext;
};

export async function createNoteEditProposal(input: ProposalInput): Promise<NoteEditProposal> {
  const baseBlocks = documentBlocksToMarkdown(input.baseDocument, input.exportContext);
  // 行の末尾のブロックの ID の印は、そのブロックに付け直す（リンクや埋め込みが、直したブロックを指し続ける）。
  const newBlocks = await markdownToBodyBlocks(input.markdown, input.importContext, "keep");
  const newBlockMarkdowns = documentBlocksToMarkdown({ type: "doc", content: newBlocks }, input.exportContext);
  return { noteId: input.noteId, summary: input.summary, baseBlocks, newBlocks, newBlockMarkdowns, hunks: diffBlocks(baseBlocks, newBlockMarkdowns) };
}

// 案を作ったあとで、エディタの本文が変わっていないかを確かめる。変わっていれば StaleNoteEditError。
export function ensureProposalIsCurrent(editor: Editor, proposal: NoteEditProposal, exportContext: BodyExportContext): void {
  const currentBlocks = documentBlocksToMarkdown(editor.getJSON(), exportContext);
  if (currentBlocks.length !== proposal.baseBlocks.length || currentBlocks.some((block, index) => block !== proposal.baseBlocks[index])) {
    throw new StaleNoteEditError();
  }
}

// エディタの本文に案を入れる。案を作ったあとで本文が変わっていれば StaleNoteEditError。
// 1 つのトランザクションで入れるので、エディタの「元に戻す」で 1 回で戻せる。
export function applyNoteEditProposal(editor: Editor, proposal: NoteEditProposal, exportContext: BodyExportContext): void {
  ensureProposalIsCurrent(editor, proposal, exportContext);
  const { state } = editor;
  // blockStarts[k] は k 番目のブロックの手前の位置。最後は本文の終わり。
  const blockStarts = [0];
  state.doc.forEach((block) => blockStarts.push(blockStarts[blockStarts.length - 1]! + block.nodeSize));
  const transaction = state.tr;
  // 後ろの所から入れ替えれば、前の所の位置は変わらない。
  for (const hunk of [...proposal.hunks].reverse()) {
    const blocks = proposal.newBlocks.slice(hunk.newStart, hunk.newEnd).map((block) => state.schema.nodeFromJSON(block));
    transaction.replaceWith(blockStarts[hunk.oldStart]!, blockStarts[hunk.oldEnd]!, blocks);
  }
  // 本文は空にしない（空のままだと、開いたデバイスごとにエディタが段落を足し、マージで空の段落が重なる）。
  if (transaction.doc.childCount === 0) {
    transaction.insert(0, state.schema.nodes.paragraph!.create());
  }
  editor.view.dispatch(transaction);
}
