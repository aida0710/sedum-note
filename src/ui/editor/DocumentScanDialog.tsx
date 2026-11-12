// 書類のスキャン。撮った（か選んだ）写真の上で書類の四隅を合わせると、傾きを直した画像にして返す。
// 画像の処理は、このデバイスの中だけで行う（外へ送らない）。文字の読み取りはしない。

import { useEffect, useRef, useState } from "react";
import { describeError } from "../i18n/describeError";
import { translate } from "../i18n/translate";
import { UserFacingError } from "../i18n/userFacingError";
import { ModalDialog } from "../shared/ModalDialog";
import { timestampedFileName } from "../shared/timestampedFileName";
import { useAsyncAction } from "../shared/useAsyncAction";
import { type Point, type Quad, straightenedSize, warpQuadToRectangle } from "./perspectiveWarp";
import { REDUCED_IMAGE_MAX_EDGE } from "./reduceImage";

// 四隅の印を最初に置く位置。画像の端から、辺の長さのこの割合だけ内側。
const INITIAL_CORNER_INSET = 0.1;
// 四隅の印の大きさ（画面の px）。指でつかめる大きさにする。
const CORNER_HANDLE_RADIUS = 14;
const JPEG_QUALITY = 0.9;
const CORNER_LABELS = ["editor.scan.cornerTopLeft", "editor.scan.cornerTopRight", "editor.scan.cornerBottomRight", "editor.scan.cornerBottomLeft"] as const;

type DocumentScanDialogProps = {
  photo: File;
  onScanned: (straightened: File) => void;
  onCancel: () => void;
};

// 写真を、扱いやすい大きさ（長い辺が添付の縮小と同じ上限）の canvas に読む。
async function readPhoto(photo: File): Promise<HTMLCanvasElement> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(photo, { imageOrientation: "from-image" });
  } catch {
    throw new UserFacingError(translate("editor.scan.unreadable"));
  }
  try {
    const scale = Math.min(1, REDUCED_IMAGE_MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return canvas;
  } finally {
    bitmap.close();
  }
}

function initialCorners(width: number, height: number): Quad {
  const insetX = width * INITIAL_CORNER_INSET;
  const insetY = height * INITIAL_CORNER_INSET;
  return [{ x: insetX, y: insetY }, { x: width - insetX, y: insetY }, { x: width - insetX, y: height - insetY }, { x: insetX, y: height - insetY }];
}

async function straightenedFile(photoCanvas: HTMLCanvasElement, corners: Quad): Promise<File> {
  const context = photoCanvas.getContext("2d");
  if (!context) {
    throw new UserFacingError(translate("editor.scan.unreadable"));
  }
  const source = context.getImageData(0, 0, photoCanvas.width, photoCanvas.height);
  const straightened = warpQuadToRectangle(source, corners, straightenedSize(corners));
  const output = document.createElement("canvas");
  output.width = straightened.width;
  output.height = straightened.height;
  output.getContext("2d")?.putImageData(new ImageData(straightened.data as Uint8ClampedArray<ArrayBuffer>, straightened.width, straightened.height), 0, 0);
  const blob = await new Promise<Blob | null>((resolve) => output.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
  if (!blob) {
    throw new UserFacingError(translate("editor.scan.unreadable"));
  }
  return new File([blob], timestampedFileName({ label: translate("editor.scan.fileName"), createdAt: new Date(), extension: "jpg" }), { type: "image/jpeg" });
}

export function DocumentScanDialog({ photo, onScanned, onCancel }: DocumentScanDialogProps) {
  const preview = useRef<HTMLCanvasElement>(null);
  const [photoCanvas, setPhotoCanvas] = useState<HTMLCanvasElement | null>(null);
  const [corners, setCorners] = useState<Quad | null>(null);
  // つかんでいる角の番号。つかんでいなければ null。
  const [draggedCorner, setDraggedCorner] = useState<number | null>(null);
  const [loadErrorMessage, setLoadErrorMessage] = useState<string | null>(null);
  const straighten = useAsyncAction(async () => {
    if (photoCanvas && corners) {
      onScanned(await straightenedFile(photoCanvas, corners));
    }
  });
  useEffect(() => {
    // 読んでいる間にダイアログを閉じたら、結果は捨てる。
    let cancelled = false;
    readPhoto(photo)
      .then((canvas) => {
        if (!cancelled) {
          setPhotoCanvas(canvas);
          setCorners(initialCorners(canvas.width, canvas.height));
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setLoadErrorMessage(describeError(error));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [photo]);
  useEffect(() => {
    const canvas = preview.current;
    if (canvas && photoCanvas) {
      canvas.width = photoCanvas.width;
      canvas.height = photoCanvas.height;
      canvas.getContext("2d")?.drawImage(photoCanvas, 0, 0);
    }
  }, [photoCanvas]);

  // 画面の上の位置を、写真の中の位置にする（写真の外へは出さない）。
  const photoPointAt = (event: React.PointerEvent): Point | null => {
    const canvas = preview.current;
    if (!canvas || !photoCanvas) {
      return null;
    }
    const box = canvas.getBoundingClientRect();
    const clamp = (value: number, max: number) => Math.min(Math.max(value, 0), max);
    return {
      x: clamp(((event.clientX - box.left) / box.width) * photoCanvas.width, photoCanvas.width - 1),
      y: clamp(((event.clientY - box.top) / box.height) * photoCanvas.height, photoCanvas.height - 1),
    };
  };
  const moveCorner = (event: React.PointerEvent) => {
    const point = photoPointAt(event);
    if (draggedCorner !== null && corners && point) {
      setCorners(corners.map((corner, index) => (index === draggedCorner ? point : corner)) as Quad);
    }
  };
  // 印の大きさは画面の px で決めたいので、写真の座標での大きさに直す。
  const handleRadius = photoCanvas && preview.current ? (CORNER_HANDLE_RADIUS * photoCanvas.width) / Math.max(preview.current.getBoundingClientRect().width, 1) : CORNER_HANDLE_RADIUS;
  const errorMessage = loadErrorMessage ?? straighten.errorMessage;

  return (
    <ModalDialog label={translate("editor.scan")} title={translate("editor.scan")} description={translate("editor.scan.description")} className="document-scan" onClose={onCancel}>
      {errorMessage && <div className="form-error" role="alert">{errorMessage}</div>}
      <div className="document-scan-photo">
        <canvas ref={preview} />
        {photoCanvas && corners && (
          <svg viewBox={`0 0 ${photoCanvas.width} ${photoCanvas.height}`} onPointerMove={moveCorner} onPointerUp={() => setDraggedCorner(null)} onPointerCancel={() => setDraggedCorner(null)}>
            <polygon points={corners.map((corner) => `${corner.x},${corner.y}`).join(" ")} />
            {corners.map((corner, index) => (
              <circle key={index} cx={corner.x} cy={corner.y} r={handleRadius} role="slider" aria-label={translate(CORNER_LABELS[index]!)}
                aria-valuetext={`${Math.round(corner.x)}, ${Math.round(corner.y)}`}
                onPointerDown={(event) => { event.currentTarget.ownerSVGElement?.setPointerCapture(event.pointerId); setDraggedCorner(index); }} />
            ))}
          </svg>
        )}
      </div>
      <div className="form-actions">
        <button type="button" className="secondary-button" onClick={onCancel}>{translate("common.cancel")}</button>
        <button type="button" className="primary-button" disabled={!corners || straighten.busy} onClick={() => void straighten.run(undefined)}>{translate("editor.scan.straighten")}</button>
      </div>
    </ModalDialog>
  );
}
