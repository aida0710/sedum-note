// 添付した PDF を、メモの中で 1 ページずつ読むプレビュー。ページ送りと拡大ができる。
// 読む部品（pdf.js）は大きいので、最初にプレビューを開くときにだけ読み込む。

import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from "lucide-react";
import type { PDFDocumentLoadingTask, PDFDocumentProxy } from "pdfjs-dist";
import { useContext, useEffect, useRef, useState } from "react";
import { describeError } from "../i18n/describeError";
import { translate } from "../i18n/translate";
import { AttachmentReaderContext } from "./attachmentReader";

type PdfLibrary = typeof import("pdfjs-dist");

let loadingLibrary: Promise<PdfLibrary> | null = null;

function loadPdfLibrary(): Promise<PdfLibrary> {
  loadingLibrary ??= Promise.all([import("pdfjs-dist"), import("pdfjs-dist/build/pdf.worker.min.mjs?url")]).then(([library, worker]) => {
    // ページを読む処理は、画面を止めないように別のスレッド（worker）で動く。アプリと一緒に配るファイルを使う。
    library.GlobalWorkerOptions.workerSrc = worker.default;
    return library;
  });
  return loadingLibrary;
}

// 拡大率の選択肢。1 は、ページの幅をプレビューの幅に合わせた大きさ。
const ZOOM_LEVELS = [0.5, 0.75, 1, 1.5, 2, 3] as const;
const FIT_WIDTH_ZOOM_INDEX = 2;
const ICON_SIZE = 16;

type PreviewState = { state: "loading" } | { state: "ready"; document: PDFDocumentProxy } | { state: "failed"; reason: string };

export function PdfPreview({ attachmentId }: { attachmentId: string }) {
  const readAttachment = useContext(AttachmentReaderContext);
  const [preview, setPreview] = useState<PreviewState>({ state: "loading" });
  const [pageNumber, setPageNumber] = useState(1);
  const [zoomIndex, setZoomIndex] = useState(FIT_WIDTH_ZOOM_INDEX);
  const canvas = useRef<HTMLCanvasElement>(null);
  const frame = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    // 開いた文書は、読み込みのタスクを通して閉じる（worker の中のデータも片付く）。
    let loadingTask: PDFDocumentLoadingTask | null = null;
    void (async () => {
      try {
        const [library, bytes] = await Promise.all([loadPdfLibrary(), readAttachment(attachmentId)]);
        if (bytes === null) {
          throw new Error(translate("editor.fileMissing"));
        }
        // pdf.js は渡したバイト列を worker へ移すので、添付の元のバイト列を壊さないように写しを渡す。
        loadingTask = library.getDocument({ data: bytes.slice() });
        const opened = await loadingTask.promise;
        if (!cancelled) {
          setPreview({ state: "ready", document: opened });
        }
      } catch (error) {
        if (!cancelled) {
          setPreview({ state: "failed", reason: describeError(error) });
        }
      }
    })();
    return () => {
      cancelled = true;
      void loadingTask?.destroy();
    };
  }, [attachmentId, readAttachment]);

  const pdfDocument = preview.state === "ready" ? preview.document : null;
  useEffect(() => {
    if (!pdfDocument || !canvas.current || !frame.current) {
      return;
    }
    let cancelled = false;
    const target = canvas.current;
    const availableWidth = frame.current.clientWidth;
    void pdfDocument.getPage(pageNumber).then((page) => {
      if (cancelled) {
        return;
      }
      const fitWidthScale = availableWidth / page.getViewport({ scale: 1 }).width;
      // 画面の画素の細かさ（devicePixelRatio）に合わせて描き、表示の大きさは CSS で決める（文字がぼやけないように）。
      const viewport = page.getViewport({ scale: fitWidthScale * (ZOOM_LEVELS[zoomIndex] ?? 1) * window.devicePixelRatio });
      target.width = viewport.width;
      target.height = viewport.height;
      target.style.width = `${viewport.width / window.devicePixelRatio}px`;
      void page.render({ canvas: target, viewport }).promise.catch(() => undefined);
    });
    return () => { cancelled = true; };
  }, [pdfDocument, pageNumber, zoomIndex]);

  if (preview.state === "failed") {
    return <div className="pdf-preview form-error" role="alert">{translate("editor.pdfPreviewFailed", { reason: preview.reason })}</div>;
  }
  const pageCount = pdfDocument?.numPages ?? 0;
  const pageButton = (label: "editor.pdfPreviousPage" | "editor.pdfNextPage", target: number, icon: React.ReactNode) => (
    <button type="button" className="icon-button" aria-label={translate(label)} disabled={target < 1 || target > pageCount} onClick={() => setPageNumber(target)}>{icon}</button>
  );
  const zoomButton = (label: "editor.pdfZoomOut" | "editor.pdfZoomIn", target: number, icon: React.ReactNode) => (
    <button type="button" className="icon-button" aria-label={translate(label)} disabled={target < 0 || target >= ZOOM_LEVELS.length} onClick={() => setZoomIndex(target)}>{icon}</button>
  );
  return (
    <div className="pdf-preview">
      <div className="pdf-preview-bar">
        {pageButton("editor.pdfPreviousPage", pageNumber - 1, <ChevronLeft size={ICON_SIZE} />)}
        <span className="pdf-page-number">{preview.state === "loading" ? translate("editor.pdfLoading") : `${pageNumber} / ${pageCount}`}</span>
        {pageButton("editor.pdfNextPage", pageNumber + 1, <ChevronRight size={ICON_SIZE} />)}
        {zoomButton("editor.pdfZoomOut", zoomIndex - 1, <ZoomOut size={ICON_SIZE} />)}
        {zoomButton("editor.pdfZoomIn", zoomIndex + 1, <ZoomIn size={ICON_SIZE} />)}
      </div>
      <div ref={frame} className="pdf-preview-page">
        <canvas ref={canvas} />
      </div>
    </div>
  );
}
