// 文字を選んだときに出るボタン（SelectionToolbar.tsx）の「AI に頼む」。押すと、選んだ所への決まった依頼
// （言い換える・要約する・英語に訳す・日本語に訳す）と「チャットで頼む」を出す。
// 決まった依頼は、選んだ文字と範囲を添えて AI のチャットへ送る（答えで、選んだ所を入れ替えられる。ai/selectionReplacement.ts）。
// 「チャットで頼む」は、チャットを開くだけ（チャットは、選んでいる文字を自分で添える）。

import type { Editor } from "@tiptap/react";
import { Languages, MessageSquare, PenLine, ScrollText, Sparkles } from "lucide-react";
import { useState } from "react";
import { type AiSelectionRequest, AI_SELECTION_REQUESTS } from "../ai/aiConversation";
import { useAiChatSession } from "../ai/aiChatSession";
import { translate } from "../i18n/translate";
import { PopupMenu } from "../shared/PopupMenu";
import { ICON_SIZE } from "../shared/iconSizes";

const REQUEST_ICONS: Record<AiSelectionRequest, typeof Sparkles> = {
  rewriteSelection: PenLine,
  summarizeSelection: ScrollText,
  translateSelectionToEnglish: Languages,
  translateSelectionToJapanese: Languages,
};

type SelectionAiMenuProps = { editor: Editor; noteId: string; noteTitle: string };

export function SelectionAiMenu({ editor, noteId, noteTitle }: SelectionAiMenuProps) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const { setOpen, setPendingRequest } = useAiChatSession();
  const request = (quickRequest: AiSelectionRequest) => {
    setAnchor(null);
    const { doc, selection } = editor.state;
    const text = doc.textBetween(selection.from, selection.to, "\n");
    setPendingRequest({
      text: translate(`ai.task.${quickRequest}`),
      attachments: [{ kind: "selection", noteTitle, text, noteId, from: selection.from, to: selection.to }],
      quickRequest,
    });
    setOpen(true);
  };
  const askInChat = () => {
    setAnchor(null);
    setOpen(true);
  };
  return (
    <>
      <button type="button" className="tool" title={translate("ai.selectionMenu")} aria-label={translate("ai.selectionMenu")} aria-haspopup="menu"
        onMouseDown={(event) => event.preventDefault()} onClick={(event) => setAnchor(anchor ? null : event.currentTarget)}>
        <Sparkles size={ICON_SIZE.button} />
      </button>
      {anchor && (
        <PopupMenu anchor={anchor} onClose={() => setAnchor(null)} align="start" takesFocus={false}>
          {(Object.keys(AI_SELECTION_REQUESTS) as AiSelectionRequest[]).map((quickRequest) => {
            const Icon = REQUEST_ICONS[quickRequest];
            return (
              <button key={quickRequest} type="button" className="menu-item" role="menuitem" onMouseDown={(event) => event.preventDefault()} onClick={() => request(quickRequest)}>
                <Icon size={ICON_SIZE.row} />{translate(`ai.task.${quickRequest}`)}
              </button>
            );
          })}
          <div className="menu-separator" />
          <button type="button" className="menu-item" role="menuitem" onMouseDown={(event) => event.preventDefault()} onClick={askInChat}>
            <MessageSquare size={ICON_SIZE.row} />{translate("ai.askInChat")}
          </button>
        </PopupMenu>
      )}
    </>
  );
}
