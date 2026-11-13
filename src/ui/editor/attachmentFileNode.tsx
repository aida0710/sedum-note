// 本文に添付した、写真以外のファイルのノード。文書には添付の ID・名前・大きさだけを入れ、
// 中身は添付（blobs/<id>）として別に暗号化して置く。押すと復号して保存する。PDF は、その場でプレビューを開ける。音声は、その場で再生できる。

import { mergeAttributes, Node, NodeViewWrapper, type ReactNodeViewProps, ReactNodeViewRenderer } from "@tiptap/react";
import { Download, Eye, FileText, Play } from "lucide-react";
import { useContext, useState } from "react";
import { ATTACHMENT_FILE_NODE } from "../../core/notes/bodyText";
import { translate } from "../i18n/translate";
import { UserFacingError } from "../i18n/userFacingError";
import { saveFile } from "../platform/saveFile";
import { formatByteSize } from "../shared/formatByteSize";
import { ProgressStatus } from "../shared/ProgressStatus";
import { useAsyncAction } from "../shared/useAsyncAction";
import { AttachmentReaderContext, useAttachmentUrl } from "./attachmentReader";
import { AttachmentUnavailable } from "./AttachmentUnavailable";
import { PdfPreview } from "./PdfPreview";

const PDF_MIME_TYPE = "application/pdf";
const AUDIO_MIME_PREFIX = "audio/";

export type AttachmentFileAttributes = { attachmentId: string; fileName: string; mimeType: string; byteLength: number };

// 添付した音声を、その場で再生する。開いたときに復号して、再生を始める。読み込んでいる間と、読めなかったときは、そう出す。
function AttachmentAudioPlayer({ attachmentId, mimeType }: { attachmentId: string; mimeType: string }) {
  const audio = useAttachmentUrl(attachmentId, mimeType);
  if (audio.state === "unavailable") {
    return <AttachmentUnavailable reason={audio.reason} onReload={audio.reload} className="attachment-audio" />;
  }
  if (audio.state === "loading") {
    return <div className="attachment-audio hint" role="status">{translate("editor.audioLoading")}</div>;
  }
  return <audio className="attachment-audio" src={audio.url} controls autoPlay />;
}

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
  const isAudio = attributes.mimeType.startsWith(AUDIO_MIME_PREFIX);
  const [playerShown, setPlayerShown] = useState(false);
  const [previewShown, setPreviewShown] = useState(false);
  return (
    <NodeViewWrapper className={`attachment-file${previewShown || playerShown ? " with-preview" : ""}`} data-drag-handle>
      <FileText size={20} className="attachment-file-icon" />
      <span className="attachment-file-name">{attributes.fileName}</span>
      {save.busy
        ? <ProgressStatus label={translate("editor.fileSaving")} progress={null} />
        : <span className="attachment-file-size">{save.errorMessage ?? formatByteSize(attributes.byteLength)}</span>}
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
      {isAudio && (
        <button type="button" className={`icon-button${playerShown ? " on" : ""}`} aria-pressed={playerShown} aria-label={translate("editor.playAudio", { name: attributes.fileName })}
          onClick={() => setPlayerShown(!playerShown)}>
          <Play size={16} />
        </button>
      )}
      {isPdf && previewShown && <PdfPreview attachmentId={attributes.attachmentId} />}
      {isAudio && playerShown && <AttachmentAudioPlayer attachmentId={attributes.attachmentId} mimeType={attributes.mimeType} />}
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
