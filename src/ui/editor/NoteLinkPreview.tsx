// メモへのリンクにポインターを乗せたときに出す、リンク先の中身の小さな見本（題と本文の頭）。
// 本文の上に重ねるので、エディタの外（document.body）に描く。読むだけで、押しても何もしない。

import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { translate } from "../i18n/translate";

// 見本に出す本文の長さの上限（文字数）。長いメモは頭だけを出す。
const MAX_PREVIEW_CHARACTERS = 280;
// リンクと見本の間の隙間（px）と、画面の端からの余白（px）。
const GAP = 6;
const VIEWPORT_MARGIN = 8;

type NoteLinkPreviewProps = {
  anchor: HTMLElement;
  title: string;
  // 本文の文字（ブロックへのリンクなら、そのブロックの文字）。
  text: string;
};

export function NoteLinkPreview({ anchor, title, text }: NoteLinkPreviewProps) {
  const previewRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: -1000, left: 0 });
  useLayoutEffect(() => {
    const anchorBox = anchor.getBoundingClientRect();
    const previewBox = previewRef.current?.getBoundingClientRect();
    const width = previewBox?.width ?? 0;
    const height = previewBox?.height ?? 0;
    const left = Math.min(Math.max(VIEWPORT_MARGIN, anchorBox.left), window.innerWidth - width - VIEWPORT_MARGIN);
    // 下に収まらなければ、リンクの上に出す。
    const below = anchorBox.bottom + GAP;
    const top = below + height > window.innerHeight - VIEWPORT_MARGIN ? Math.max(VIEWPORT_MARGIN, anchorBox.top - height - GAP) : below;
    setPosition({ top, left });
  }, [anchor]);
  const shownText = text.length > MAX_PREVIEW_CHARACTERS ? `${text.slice(0, MAX_PREVIEW_CHARACTERS)}…` : text;
  return createPortal(
    <div ref={previewRef} className="note-link-preview" role="tooltip" style={position}>
      <div className="note-link-preview-title">{title || translate("sidebar.untitled")}</div>
      {shownText ? <div className="note-link-preview-text">{shownText}</div> : <div className="note-link-preview-empty">{translate("editor.noteLinkPreviewEmpty")}</div>}
    </div>,
    document.body,
  );
}
