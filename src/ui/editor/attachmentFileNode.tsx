// 本文に添付した、写真以外のファイルのノード。文書には添付の ID・名前・大きさだけを入れ、
// 中身は添付（blobs/<id>）として別に暗号化して置く。押すと復号して保存する。PDF は、その場でプレビューを開ける。

import { mergeAttributes, Node, NodeViewWrapper, type ReactNodeViewProps, ReactNodeViewRenderer } from "@tiptap/react";
import { Download, Eye, FileText } from "lucide-react";
import { useContext, useState } from "react";
import { ATTACHMENT_FILE_NODE } from "../../core/notes/bodyText";
import { translate } from "../i18n/translate";
import { UserFacingError } from "../i18n/userFacingError";
import { saveFile } from "../platform/saveFile";
import { formatByteSize } from "../shared/formatByteSize";
import { useAsyncAction } from "../shared/useAsyncAction";
import { AttachmentReaderContext } from "./attachmentReader";
import { PdfPreview } from "./PdfPreview";

const PDF_MIME_TYPE = "application/pdf";

export type AttachmentFileAttributes = { attachmentId: string; fileName: string; mimeType: string; byteLength: number };

function AttachmentFileView({ node }: ReactNodeViewProps) {
  const attributes = node.attrs as AttachmentFileAttributes;
  const readAttachment = useContext(AttachmentReaderContext);
  const save = useAsyncAction(async () => {
    const bytes = await readAttachment(attributes.attachmentId);
    if (bytes === null) {
      throw new UserFacingError(translate("editor.fileMissing"));
    }
    await saveFile({ suggestedName: attributes.fileName, parts: [bytes], mimeType: attributes.mimeType });
  });
  const isPdf = attributes.mimeType === PDF_MIME_TYPE;
  const [previewShown, setPreviewShown] = useState(false);
  return (
    <NodeViewWrapper className={`attachment-file${previewShown ? " with-preview" : ""}`} data-drag-handle>
      <FileText size={20} className="attachment-file-icon" />
      <span className="attachment-file-name">{attributes.fileName}</span>
      <span className="attachment-file-size">{save.errorMessage ?? formatByteSize(attributes.byteLength)}</span>
      <button type="button" className="icon-button" disabled={save.busy} aria-label={translate("editor.saveFile", { name: attributes.fileName })}
        onClick={() => void save.run(undefined)}>
        <Download size={16} />
      </button>
      {isPdf && (
        <button type="button" className={`icon-button${previewShown ? " on" : ""}`} aria-pressed={previewShown} aria-label={translate("editor.pdfPreview", { name: attributes.fileName })}
          onClick={() => setPreviewShown(!previewShown)}>
          <Eye size={16} />
        </button>
      )}
      {isPdf && previewShown && <PdfPreview attachmentId={attributes.attachmentId} />}
    </NodeViewWrapper>
  );
}

export const AttachmentFile = Node.create({
  name: ATTACHMENT_FILE_NODE,
  group: "block",
  atom: true,
  draggable: true,
  addAttributes() {
    return {
      attachmentId: { default: null },
      fileName: { default: "" },
      mimeType: { default: "application/octet-stream" },
      byteLength: { default: 0 },
    };
  },
  parseHTML() {
    return [{ tag: "div[data-attachment-file-id]", getAttrs: (element) => ({ attachmentId: element.getAttribute("data-attachment-file-id") }) }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes({ "data-attachment-file-id": HTMLAttributes.attachmentId })];
  },
  addNodeView() {
    return ReactNodeViewRenderer(AttachmentFileView);
  },
});
