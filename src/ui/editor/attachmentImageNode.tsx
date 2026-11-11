// 本文に貼った写真のノード。文書には添付の ID だけを入れ、画像のバイト列は
// 添付（blobs/<id>）として別に暗号化して置く。

import { mergeAttributes, Node, NodeViewWrapper, type ReactNodeViewProps, ReactNodeViewRenderer } from "@tiptap/react";
import { ATTACHMENT_IMAGE_NODE } from "../../core/notes/bodyText";
import { translate } from "../i18n/translate";
import { useAttachmentUrl } from "./attachmentReader";

export type AttachmentImageAttributes = { attachmentId: string; fileName: string; mimeType: string };

function AttachmentImageView({ node }: ReactNodeViewProps) {
  const attributes = node.attrs as AttachmentImageAttributes;
  const image = useAttachmentUrl(attributes.attachmentId, attributes.mimeType);
  return (
    <NodeViewWrapper className="attachment-image" data-drag-handle>
      {image.state === "ready" && <img src={image.url} alt={attributes.fileName} draggable={false} />}
      {image.state === "loading" && <div className="placeholder">{translate("editor.imageLoading")}</div>}
      {image.state === "missing" && <div className="placeholder">{translate("editor.imageMissing")}</div>}
      {attributes.fileName && <span className="file-name">{attributes.fileName}</span>}
    </NodeViewWrapper>
  );
}

export const AttachmentImage = Node.create({
  name: ATTACHMENT_IMAGE_NODE,
  group: "block",
  atom: true,
  draggable: true,
  addAttributes() {
    return {
      attachmentId: { default: null },
      fileName: { default: "" },
      mimeType: { default: "image/jpeg" },
      // 元のファイルの大きさ。v0.2.0 までに貼った写真には記録が無く、0 になる。
      byteLength: { default: 0 },
    };
  },
  parseHTML() {
    return [{ tag: "figure[data-attachment-id]", getAttrs: (element) => ({ attachmentId: element.getAttribute("data-attachment-id") }) }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["figure", mergeAttributes({ "data-attachment-id": HTMLAttributes.attachmentId })];
  },
  addNodeView() {
    return ReactNodeViewRenderer(AttachmentImageView);
  },
});
