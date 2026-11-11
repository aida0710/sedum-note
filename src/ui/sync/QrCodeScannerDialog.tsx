// カメラをかざして QR を読むダイアログ。読めたら、中の文字を渡して閉じる。
// カメラを使えない・許可されなかったときは、その理由を出す（呼び出し側が、画像から読む方法を別に用意する）。

import { useEffect, useRef, useState } from "react";
import { translate } from "../i18n/translate";
import { ModalDialog } from "../shared/ModalDialog";
import { readQrCodeFromVideoFrame } from "./syncSetupQrCode";

// 映像から QR を探す間隔。短いほど早く読めるが、スマホが熱くなる。
const SCAN_INTERVAL_MILLISECONDS = 200;

type QrCodeScannerDialogProps = {
  onRead: (text: string) => void;
  onClose: () => void;
};

export function QrCodeScannerDialog({ onRead, onClose }: QrCodeScannerDialogProps) {
  const video = useRef<HTMLVideoElement>(null);
  const [cameraProblem, setCameraProblem] = useState<string | null>(null);
  // 読めたときの処理は、開いている間に変わっても、カメラを開き直さない。
  const onReadRef = useRef(onRead);
  onReadRef.current = onRead;

  useEffect(() => {
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;
    let closed = false;
    const canvas = document.createElement("canvas");
    // 背面のカメラを優先する（スマホで、相手の画面に向けるため）。
    navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false })
      .then((opened) => {
        if (closed) {
          opened.getTracks().forEach((track) => track.stop());
          return;
        }
        stream = opened;
        const element = video.current;
        if (!element) {
          return;
        }
        element.srcObject = opened;
        // 再生の開始を断るブラウザがあっても、autoplay で始まれば読める。始まらなければ、映像が出ないだけで待ち続ける。
        void element.play().catch(() => undefined);
        timer = setInterval(() => {
          const text = readQrCodeFromVideoFrame(element, canvas);
          if (text !== null && timer !== null) {
            // 1 度読めたら、閉じるまでの間に同じ QR を何度も渡さない。
            clearInterval(timer);
            timer = null;
            onReadRef.current(text);
          }
        }, SCAN_INTERVAL_MILLISECONDS);
      })
      .catch((error: unknown) => {
        const denied = error instanceof DOMException && (error.name === "NotAllowedError" || error.name === "SecurityError");
        setCameraProblem(translate(denied ? "syncSetup.cameraDenied" : "syncSetup.cameraUnavailable"));
      });
    return () => {
      closed = true;
      if (timer !== null) {
        clearInterval(timer);
      }
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  return (
    <ModalDialog label={translate("syncSetup.scanTitle")} className="qr-code-scanner" onClose={onClose}>
      <h2>{translate("syncSetup.scanTitle")}</h2>
      {cameraProblem === null ? (
        <>
          <p>{translate("syncSetup.scanDescription")}</p>
          {/* playsInline が無いと、iPhone では全画面の再生に切り替わる。 */}
          <video ref={video} className="qr-code-scanner-video" playsInline muted autoPlay />
        </>
      ) : <div className="form-error" role="alert">{cameraProblem}</div>}
      <div className="form-actions">
        <button type="button" className="secondary-button" onClick={onClose}>{translate("common.close")}</button>
      </div>
    </ModalDialog>
  );
}
