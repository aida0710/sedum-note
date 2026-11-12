// 動画や Web ページの埋め込み。文書には URL だけを入れる。メモを開いただけでは外へ通信せず、
// 「読み込む」を押したときに初めて、その URL を枠（iframe）の中に読み込む。
// Markdown には埋め込みが無いので、Markdown で書き出すと、URL のリンクになる。

import { mergeAttributes, Node, NodeViewWrapper, type ReactNodeViewProps, ReactNodeViewRenderer } from "@tiptap/react";
import { Play } from "lucide-react";
import { useState } from "react";
import { translate } from "../i18n/translate";
import { isImeKeyEvent } from "../shared/imeKeyEvent";

export const EMBED_NODE = "embed";
const EMBED_INPUT_CLASS = "embed-url-input";

// 埋め込み用の URL が別にある動画のサービス。ふつうのページの URL から、埋め込み用の URL を作る。
const VIDEO_EMBED_URLS: Array<{ pattern: RegExp; embedUrl: (videoId: string) => string }> = [
  { pattern: /^https:\/\/(?:www\.|m\.)?youtube\.com\/watch\?(?:.*&)?v=([\w-]{6,})/, embedUrl: (videoId) => `https://www.youtube-nocookie.com/embed/${videoId}` },
  { pattern: /^https:\/\/youtu\.be\/([\w-]{6,})/, embedUrl: (videoId) => `https://www.youtube-nocookie.com/embed/${videoId}` },
  { pattern: /^https:\/\/(?:www\.)?vimeo\.com\/(\d+)/, embedUrl: (videoId) => `https://player.vimeo.com/video/${videoId}` },
];

// 枠の中に読み込む URL。https の URL だけを受け付け、それ以外は null。
export function embedFrameUrl(url: string): string | null {
  const trimmed = url.trim();
  if (!/^https:\/\/[^\s]+$/.test(trimmed)) {
    return null;
  }
  for (const { pattern, embedUrl } of VIDEO_EMBED_URLS) {
    const videoId = pattern.exec(trimmed)?.[1];
    if (videoId) {
      return embedUrl(videoId);
    }
  }
  return trimmed;
}

function EmbedView({ node, updateAttributes, editor }: ReactNodeViewProps) {
  const url = String(node.attrs.url ?? "");
  const [draft, setDraft] = useState(url);
  // メモを開くたびに、読み込むかを聞き直す（読み込んだことは保存しない）。
  const [loaded, setLoaded] = useState(false);
  const frameUrl = embedFrameUrl(url);
  if (frameUrl === null) {
    return (
      <NodeViewWrapper className="embed" contentEditable={false}>
        <input className={EMBED_INPUT_CLASS} value={draft} readOnly={!editor.isEditable} autoFocus={editor.isEditable} placeholder={translate("editor.embedPlaceholder")}
          aria-label={translate("editor.embedUrl")} inputMode="url" spellCheck={false} onChange={(event) => setDraft(event.target.value)}
          onBlur={() => updateAttributes({ url: draft.trim() })}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !isImeKeyEvent(event.nativeEvent)) {
              event.preventDefault();
              updateAttributes({ url: draft.trim() });
            }
          }} />
        {draft.trim() !== "" && embedFrameUrl(draft) === null && <span className="hint">{translate("editor.embedNeedsHttps")}</span>}
      </NodeViewWrapper>
    );
  }
  return (
    <NodeViewWrapper className="embed" contentEditable={false} data-drag-handle>
      {loaded ? (
        // sandbox: 枠の中のページに、このアプリの画面を書き換えさせず、ほかの窓も開かせない。
        <iframe className="embed-frame" src={frameUrl} title={url} sandbox="allow-scripts allow-same-origin allow-presentation" allow="fullscreen; picture-in-picture"
          referrerPolicy="no-referrer" loading="lazy" />
      ) : (
        <div className="embed-card">
          <span className="embed-url">{url}</span>
          <button type="button" className="secondary-button" onClick={() => setLoaded(true)}><Play size={14} />{translate("editor.embedLoad")}</button>
        </div>
      )}
    </NodeViewWrapper>
  );
}

export const Embed = Node.create({
  name: EMBED_NODE,
  group: "block",
  atom: true,
  draggable: true,
  addAttributes() {
    return {
      url: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-embed-url") ?? "",
        renderHTML: (attributes) => ({ "data-embed-url": String(attributes.url ?? "") }),
      },
    };
  },
  parseHTML() {
    return [{ tag: "div[data-embed-url]" }];
  },
  renderHTML({ HTMLAttributes, node }) {
    const url = String(node.attrs.url ?? "");
    return ["div", mergeAttributes(HTMLAttributes), ["a", { href: url }, url]];
  },
  addNodeView() {
    // URL の入力欄の中のキーや選択を、エディタに渡さない（渡すと、WebKit では打った文字が本文に入る）。
    return ReactNodeViewRenderer(EmbedView, { stopEvent: ({ event }) => (event.target as HTMLElement | null)?.classList?.contains(EMBED_INPUT_CLASS) ?? false });
  },
  renderMarkdown: (node) => {
    const url = String(node.attrs?.url ?? "");
    return url === "" ? "" : `<${url}>`;
  },
});
