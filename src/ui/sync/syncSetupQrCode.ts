// 同期の設定の文書を、QR にする・QR をカメラの映像や画像から読む。
// 文書は暗号化キーが無いと読めないので、QR を画面に出しても、写真に撮られても、設定は漏れない。

import jsQR from "jsqr";
import QRCode from "qrcode";

// 画面に出す QR の 1 辺（px）。文書は 700 文字ほどあり、点が細かいので大きめに描く。
const QR_IMAGE_SIZE = 560;
// 写真から読むときに試す、長い辺の大きさ（px）。スマホの写真は大きすぎて読めないことがあるので、縮めて試す。
const SCAN_SIZES = [1600, 1000, 640] as const;
// カメラの映像から読むときの、長い辺の大きさ（px）。
const VIDEO_SCAN_SIZE = 1000;

// QR の画像（data URL）を作る。
export function renderSyncSetupQrCode(setup: string): Promise<string> {
  // 誤りの訂正を弱くして、点を粗くする（画面から撮るので、汚れや欠けは少ない）。
  return QRCode.toDataURL(setup, { errorCorrectionLevel: "L", width: QR_IMAGE_SIZE, margin: 2 });
}

// 写真や画像のファイルから QR を読み、中の文字を返す。読めなければ null。
export async function readQrCodeFromImage(file: Blob): Promise<string | null> {
  const bitmap = await createImageBitmap(file);
  try {
    for (const size of SCAN_SIZES) {
      const scale = Math.min(1, size / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      const context = canvas.getContext("2d");
      if (!context) {
        return null;
      }
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
      const found = jsQR(pixels.data, pixels.width, pixels.height);
      if (found) {
        return found.data;
      }
    }
    return null;
  } finally {
    bitmap.close();
  }
}

// このデバイスで、カメラの映像を取れるか（古い WebView や、カメラを扱えない Linux のアプリでは取れない）。
export function canUseCamera(): boolean {
  return typeof navigator.mediaDevices?.getUserMedia === "function";
}

// カメラの映像の今のコマから QR を読む。読めなければ null。canvas は呼び出し側が使い回す。
export function readQrCodeFromVideoFrame(video: HTMLVideoElement, canvas: HTMLCanvasElement): string | null {
  if (video.videoWidth === 0 || video.videoHeight === 0) {
    return null;
  }
  // 細かすぎる映像は読むのに時間がかかるので、長い辺を揃える。
  const scale = Math.min(1, VIDEO_SCAN_SIZE / Math.max(video.videoWidth, video.videoHeight));
  canvas.width = Math.round(video.videoWidth * scale);
  canvas.height = Math.round(video.videoHeight * scale);
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    return null;
  }
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  return jsQR(pixels.data, pixels.width, pixels.height)?.data ?? null;
}
