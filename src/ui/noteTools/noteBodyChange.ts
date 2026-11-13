// 本文の差し替え（replace_note_body）を、変わったブロックだけの入れ替えにする。AI（や MCP のクライアント）は
// 直したあとの本文の全体を Markdown で渡すので、今の本文と一番上のブロックごとに比べ、変わった所だけを本文の
// Yjs の文書に書く。直していないブロックの、Markdown に無い書式（文字色、セルの結合など）とブロックの ID は落ちない。
// エディタを通さずに書くので、エディタで開いていないメモにも使える（開いているメモは、エディタが変更を受け取る）。
//
// 書き出せないブロック（先のメモが消えた埋め込みなど）は、Markdown に出てこないので比べられない。比べる並びから外し、
// 動かさない（消さない）。比べる並びの何番目が本文の何番目かを、blockIndexes に持つ。

import type { JSONContent } from "@tiptap/core";
import { prosemirrorJSONToYXmlFragment, yXmlFragmentToProsemirrorJSON } from "@tiptap/y-tiptap";
import * as Y from "yjs";
import { copyBodyBlocks } from "../../core/notes/bodyCopy";
import { NOTE_TOOL_ORIGIN } from "../../core/notes/recordDocument";
import { documentSchema } from "../editor/documentSchema";
import { type BodyExportContext, documentBlockMarkdowns, documentBlocksToMarkdown, type MarkdownImportContext, markdownToBodyBlocks } from "../markdown/markdownDocument";
import { alignBlocks, type BlockHunk } from "./blockDiff";

// 案を作ったあとで本文が変わっていて、案のとおりには入れ替えられない。
export class StaleBodyChangeError extends Error {
  constructor() {
    super("the note changed after the change was prepared");
    this.name = "StaleBodyChangeError";
  }
}

export type BodyChangeProposal = {
  // 案を作ったときの本文の、書き出せるブロックごとの Markdown と、それぞれが本文の何番目のブロックか。
  baseBlocks: string[];
  blockIndexes: number[];
  // 直したあとの本文のブロックと、その Markdown（差分を見せるのに使う）。
  newBlocks: JSONContent[];
  newBlockMarkdowns: string[];
  // baseBlocks の [oldStart, oldEnd) を、newBlocks の [newStart, newEnd) に入れ替える所。
  hunks: BlockHunk[];
};

type ExportableBlocks = { markdowns: string[]; indexes: number[] };

function exportableBlocksOf(body: Y.XmlFragment, context: BodyExportContext): ExportableBlocks {
  const markdowns: string[] = [];
  const indexes: number[] = [];
  documentBlockMarkdowns(yXmlFragmentToProsemirrorJSON(body) as JSONContent, context).forEach((markdown, index) => {
    if (markdown !== null) {
      markdowns.push(markdown);
      indexes.push(index);
    }
  });
  return { markdowns, indexes };
}

type ProposalInput = { body: Y.XmlFragment; markdown: string; exportContext: BodyExportContext; importContext: MarkdownImportContext };

export async function createBodyChangeProposal({ body, markdown, exportContext, importContext }: ProposalInput): Promise<BodyChangeProposal> {
  const { markdowns: baseBlocks, indexes: blockIndexes } = exportableBlocksOf(body, exportContext);
  // 行の末尾のブロックの ID の印は、そのブロックに付け直す（リンクや埋め込みが、直したブロックを指し続ける）。
  const newBlocks = await markdownToBodyBlocks(markdown, importContext, "keep");
  const newBlockMarkdowns = documentBlocksToMarkdown({ type: "doc", content: newBlocks }, exportContext);
  // 元のブロックを、新しい本文と同じ道筋（Markdown にして読み直す）で通した形と比べる。そのまま返ってきたブロックは、
  // 読み直すと形の変わるもの（段組みなど）でも、元のブロックのまま残せる。空の段落は、1 つだけで読み直すと消えるが、
  // 本文の全体の中では空の段落として読まれる（返ってくる本文も同じ）。
  const roundTrips = await Promise.all(baseBlocks.map(async (block) => (block === "" ? [""] : documentBlocksToMarkdown(
    { type: "doc", content: await markdownToBodyBlocks(block, importContext, "keep") }, exportContext,
  ))));
  return { baseBlocks, blockIndexes, newBlocks, newBlockMarkdowns, hunks: alignBlocks(roundTrips, newBlockMarkdowns) };
}

// 案を作ったときから、本文が変わっていないか。
export function isBodyChangeCurrent(body: Y.XmlFragment, proposal: BodyChangeProposal, exportContext: BodyExportContext): boolean {
  const current = exportableBlocksOf(body, exportContext);
  const same = (left: readonly (string | number)[], right: readonly (string | number)[]) => left.length === right.length && left.every((value, index) => value === right[index]);
  return same(current.markdowns, proposal.baseBlocks) && same(current.indexes, proposal.blockIndexes);
}

// 新しいブロックを、本文に入れられる Yjs の要素にする（いったん別の文書に入れてから写す）。
function yBlocksOf(blocks: JSONContent[]): Y.XmlElement[] {
  if (blocks.length === 0) {
    return [];
  }
  const staging = new Y.Doc();
  const staged = staging.getXmlFragment("staged");
  prosemirrorJSONToYXmlFragment(documentSchema(), { type: "doc", content: blocks }, staged);
  const copied = copyBodyBlocks(staged);
  staging.destroy();
  return copied;
}

// 案を本文に書く。案を作ったあとで本文が変わっていれば StaleBodyChangeError（何も書かない）。
// 1 つのトランザクションで書くので、ほかのデバイスには 1 つの変更として届き、開いているエディタでは 1 回の取り消しで戻る。
export function applyBodyChange(body: Y.XmlFragment, proposal: BodyChangeProposal, exportContext: BodyExportContext): void {
  if (!isBodyChangeCurrent(body, proposal, exportContext)) {
    throw new StaleBodyChangeError();
  }
  const { blockIndexes } = proposal;
  // 書き出せるブロックの何番目の手前に入れるかを、本文の位置にする。最後の後ろなら、最後の書き出せるブロックのすぐ後ろ。
  const insertionIndexOf = (exportableIndex: number): number => {
    if (exportableIndex < blockIndexes.length) {
      return blockIndexes[exportableIndex]!;
    }
    return blockIndexes.length === 0 ? body.length : blockIndexes[blockIndexes.length - 1]! + 1;
  };
  const write = () => {
    // 後ろの所から入れ替えれば、前の所の位置は変わらない。消すのは比べた（書き出せる）ブロックだけで、間の書き出せないブロックは残る。
    for (const hunk of [...proposal.hunks].reverse()) {
      const insertionIndex = insertionIndexOf(hunk.oldStart);
      for (let exportableIndex = hunk.oldEnd - 1; exportableIndex >= hunk.oldStart; exportableIndex -= 1) {
        body.delete(blockIndexes[exportableIndex]!, 1);
      }
      const added = yBlocksOf(proposal.newBlocks.slice(hunk.newStart, hunk.newEnd));
      if (added.length > 0) {
        body.insert(insertionIndex, added);
      }
    }
    // 本文は空にしない（空のままだと、開いたデバイスごとにエディタが段落を足し、マージで空の段落が重なる）。
    if (body.length === 0) {
      body.insert(0, [new Y.XmlElement("paragraph")]);
    }
  };
  if (body.doc) {
    body.doc.transact(write, NOTE_TOOL_ORIGIN);
  } else {
    write();
  }
}
