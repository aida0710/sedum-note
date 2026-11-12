// 直しの案を、開いているメモのエディタに入れる。入れる前の状態は、いつも履歴に残す（入れたあとでも戻せるように）。

import type { NoteRepository } from "../../core/notes/noteRepository";
import { markdownExportContextOf } from "../markdown/repositoryMarkdownContext";
import type { ActiveNoteEditor } from "./aiChatSession";
import { applyNoteEditProposal, ensureProposalIsCurrent, type NoteEditProposal, StaleNoteEditError } from "./noteEditProposal";
import type { NoteEditStatus } from "./noteEditTool";

// 案のメモを、エディタで開いていて書き換えられるか（案はエディタを通して入れる）。
export function canApplyProposalTo(activeNote: ActiveNoteEditor | null, noteId: string): boolean {
  return activeNote?.noteId === noteId && activeNote.editor.isEditable;
}

// 案を入れ、案の行方を返す。案を作ったあとでメモが変わっていたら、入れずに stale を返す。
export async function applyProposalToOpenNote(input: { repository: NoteRepository; activeNote: ActiveNoteEditor | null; proposal: NoteEditProposal }): Promise<NoteEditStatus> {
  const { repository, activeNote, proposal } = input;
  if (!activeNote || !canApplyProposalTo(activeNote, proposal.noteId)) {
    return "proposed";
  }
  const exportContext = markdownExportContextOf(repository);
  try {
    // 確かめてから履歴に残す（使えない案のために、履歴を増やさない）。
    ensureProposalIsCurrent(activeNote.editor, proposal, exportContext);
    await repository.captureVersionBeforeReplace(proposal.noteId);
    applyNoteEditProposal(activeNote.editor, proposal, exportContext);
    return "applied";
  } catch (error) {
    if (error instanceof StaleNoteEditError) {
      return "stale";
    }
    throw error;
  }
}
