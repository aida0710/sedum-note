// 添付（暗号化した写真など）を復号して、画面で使える URL にする。

import { createContext, useCallback, useContext, useEffect, useState } from "react";

export type AttachmentReader = (attachmentId: string) => Promise<Uint8Array | null>;

export const AttachmentReaderContext = createContext<AttachmentReader>(() => Promise.resolve(null));

// 読めなかった理由。
//   notDelivered: このデバイスにも同期先にも無い（添付したデバイスがまだ同期していない）。
//   failed: 同期先から取ってこられなかったか、復号できなかった（通信の失敗など）。添付の ID の無いノードも、こちら。
export type AttachmentUnavailableReason = "notDelivered" | "failed";

export type AttachmentUrlState =
  | { state: "loading" }
  | { state: "ready"; url: string }
  | { state: "unavailable"; reason: AttachmentUnavailableReason };

// 読めなかった添付は、reload で読み直せる（同期で届いたあと、通信が戻ったあと）。
export function useAttachmentUrl(attachmentId: string | null, mimeType = "application/octet-stream"): AttachmentUrlState & { reload: () => void } {
  const readAttachment = useContext(AttachmentReaderContext);
  const [urlState, setUrlState] = useState<AttachmentUrlState>({ state: "loading" });
  const [attempt, setAttempt] = useState(0);
  const reload = useCallback(() => setAttempt((current) => current + 1), []);
  useEffect(() => {
    if (attachmentId === null) {
      setUrlState({ state: "unavailable", reason: "failed" });
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
          setUrlState({ state: "unavailable", reason: "notDelivered" });
          return;
        }
        url = URL.createObjectURL(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: mimeType }));
        setUrlState({ state: "ready", url });
      })
      .catch(() => {
        if (!cancelled) {
          setUrlState({ state: "unavailable", reason: "failed" });
        }
      });
    return () => {
      cancelled = true;
      if (url !== null) {
        URL.revokeObjectURL(url);
      }
    };
  }, [attachmentId, mimeType, readAttachment, attempt]);
  return { ...urlState, reload };
}
