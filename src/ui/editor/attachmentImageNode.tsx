// 本文に貼った写真のノード。文書には添付の ID だけを入れ、画像のバイト列は
// 添付（blobs/<id>）として別に暗号化して置く。
// 右下の持ち手をドラッグすると幅を変えられる（imageResize.ts）。持ち手をダブルクリックすると、本文の幅に合わせる形に戻る。

import { mergeAttributes, Node, NodeViewWrapper, type ReactNodeViewProps, ReactNodeViewRenderer } from "@tiptap/react";
import { useRef } from "react";
import { ATTACHMENT_IMAGE_NODE } from "../../core/notes/bodyText";
import { translate } from "../i18n/translate";
import { useAttachmentUrl } from "./attachmentReader";
import { AttachmentUnavailable } from "./AttachmentUnavailable";
import { startImageResize } from "./imageResize";

// width: 写真の幅（px）。null なら幅を決めず、本文の幅に収まる大きさで出す。
export type AttachmentImageAttributes = { attachmentId: string; fileName: string; mimeType: string; width: number | null };

function AttachmentImageView({ node, editor, selected, updateAttributes }: ReactNodeViewProps) {
  const attributes = node.attrs as AttachmentImageAttributes;
  const image = useAttachmentUrl(attributes.attachmentId, attributes.mimeType);
  const imageElement = useRef<HTMLImageElement>(null);
  const setWidth = (width: number | null) => updateAttributes({ width });
  return (
    <NodeViewWrapper className={`attachment-image${image.state === "ready" ? " loaded" : ""}${attributes.width ? " sized" : ""}${selected ? " selected" : ""}`} data-drag-handle>
      {image.state === "ready" && (
        <img ref={imageElement} src={image.url} alt={attributes.fileName} draggable={false} decoding="async" style={attributes.width ? { width: attributes.width } : undefined} />
      )}
      {image.state === "ready" && editor.isEditable && (
        <button type="button" className="image-resize-handle" aria-label={translate("editor.resizeImage")} title={translate("editor.resizeImage")}
          onPointerDown={(event) => startImageResize(event, { image: imageElement.current, onCommit: setWidth })}
          onDoubleClick={() => setWidth(null)} />
      )}
      {image.state === "loading" && <div className="placeholder">{translate("editor.imageLoading")}</div>}
      {image.state === "unavailable" && <AttachmentUnavailable reason={image.reason} onReload={image.reload} className="placeholder" />}
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
      // 写真の幅（px）。データの形の版 15 で足した。
      width: { default: null },
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
