// 本文の Web のリンクの中にカーソルがある間、そのすぐ下に出す小さな面。リンク先の URL を見せ、開く・編集・解除のボタンを置く。
// 本文と一緒に送られるよう、エディタを包む要素（持ち手と同じ所）の中に描く。

import { type Editor, useEditorState } from "@tiptap/react";
import { ExternalLink, type LucideIcon, Pencil, Unlink } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { type MessageKey, translate } from "../i18n/translate";
import { TOOL_ICON_SIZE } from "./TextFormattingTools";
import { openableWebLinkUrl } from "./webLinks";

// カーソルの行と面の間（px）。
const GAP_BELOW_LINE = 6;
// 面の左端を、カーソルよりどれだけ左に置くか（px）。カーソルの真下に URL の頭が来るように。
const LEFT_OF_CURSOR = 12;

type WebLinkPopoverProps = {
  editor: Editor;
  onOpenLink: (url: string) => void;
  // 新しいリンク先を聞く。やめたら null。
  onAskLink: (currentUrl: string) => Promise<string | null>;
};

// カーソル（選択なし）のあるリンクの、リンク先と、カーソルの位置。本文にフォーカスが無いときと、リンクの外では null。
function webLinkAtCursor(editor: Editor): { href: string; cursor: number } | null {
  const { selection, schema } = editor.state;
  const linkType = schema.marks.link;
  if (!selection.empty || !linkType || !editor.view.hasFocus()) {
    return null;
  }
  // リンクのすぐ前とすぐ後ろ（リンクの端）にカーソルがあるときも、そのリンクとして扱う。
  const { nodeBefore, nodeAfter } = selection.$from;
  const linkMark = [...(nodeAfter?.marks ?? []), ...(nodeBefore?.marks ?? [])].find((mark) => mark.type === linkType);
  const href: unknown = linkMark?.attrs.href;
  return typeof href === "string" && href !== "" ? { href, cursor: selection.from } : null;
}

export function WebLinkPopover({ editor, onOpenLink, onAskLink }: WebLinkPopoverProps) {
  const link = useEditorState({ editor, selector: ({ editor: current }) => webLinkAtCursor(current) });
  const popoverRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const container = editor.view.dom.parentElement;
  useLayoutEffect(() => {
    const popover = popoverRef.current;
    if (!link || !container || !popover) {
      setPosition(null);
      return;
    }
    const cursorBox = editor.view.coordsAtPos(link.cursor);
    const containerBox = container.getBoundingClientRect();
    const rightmostLeft = Math.max(0, containerBox.width - popover.offsetWidth);
    setPosition({
      top: cursorBox.bottom - containerBox.top + GAP_BELOW_LINE,
      left: Math.min(Math.max(0, cursorBox.left - containerBox.left - LEFT_OF_CURSOR), rightmostLeft),
    });
  }, [link, container, editor]);
  if (!link || !container) {
    return null;
  }
  const openableUrl = openableWebLinkUrl(link.href);
  const editLink = async () => {
    const href = await onAskLink(link.href);
    if (href) {
      editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
    }
  };
  const action = (label: MessageKey, Icon: LucideIcon, onPress: () => void) => (
    // 押しても、本文からフォーカスとカーソルを奪わない。
    <button type="button" className="tool" title={translate(label)} aria-label={translate(label)} onMouseDown={(event) => event.preventDefault()} onClick={onPress}>
      <Icon size={TOOL_ICON_SIZE} />
    </button>
  );
  return createPortal(
    <div ref={popoverRef} className="web-link-popover" role="group" aria-label={translate("editor.link")} contentEditable={false}
      style={position ?? { visibility: "hidden" }}>
      <span className="web-link-url" title={link.href}>{link.href}</span>
      {openableUrl && action("editor.openLink", ExternalLink, () => onOpenLink(openableUrl))}
      {editor.isEditable && action("editor.editLink", Pencil, () => void editLink())}
      {editor.isEditable && action("editor.removeLink", Unlink, () => editor.chain().focus().extendMarkRange("link").unsetLink().run())}
    </div>,
    container,
  );
}
