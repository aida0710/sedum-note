// 添付（暗号化した写真など）を復号して、画面で使える URL にする。

import { createContext, useContext, useEffect, useState } from "react";

export type AttachmentReader = (attachmentId: string) => Promise<Uint8Array | null>;

export const AttachmentReaderContext = createContext<AttachmentReader>(() => Promise.resolve(null));

export type AttachmentUrlState = { state: "loading" } | { state: "ready"; url: string } | { state: "missing" };

export function useAttachmentUrl(attachmentId: string | null, mimeType = "application/octet-stream"): AttachmentUrlState {
  const readAttachment = useContext(AttachmentReaderContext);
  const [urlState, setUrlState] = useState<AttachmentUrlState>({ state: "loading" });
  useEffect(() => {
    if (attachmentId === null) {
      setUrlState({ state: "missing" });
      return;
    }
    let url: string | null = null;
    let cancelled = false;
    setUrlState({ state: "loading" });
    readAttachment(attachmentId)
      .then((bytes) => {
        if (cancelled) {
          return;
        }
        if (bytes === null) {
          setUrlState({ state: "missing" });
          return;
        }
        url = URL.createObjectURL(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: mimeType }));
        setUrlState({ state: "ready", url });
      })
      .catch(() => {
        if (!cancelled) {
          setUrlState({ state: "missing" });
        }
      });
    return () => {
      cancelled = true;
      if (url !== null) {
        URL.revokeObjectURL(url);
      }
    };
  }, [attachmentId, mimeType, readAttachment]);
  return urlState;
}
