// Android で、カメラで撮った写真の一時ファイル（暗号化されていない）を消す。添付にし終えたあとに呼ぶ。
// ネイティブ側は CapturedPhotosBridge.kt。ほかの環境では何もしない。

// MainActivity.kt の CAPTURED_PHOTOS_BRIDGE_NAME と揃える。
const CAPTURED_PHOTOS_BRIDGE_NAME = "SedumNoteCapturedPhotos";

export function deleteCapturedPhotos(): void {
  (window as unknown as Record<string, { deleteCapturedPhotos: () => void } | undefined>)[CAPTURED_PHOTOS_BRIDGE_NAME]?.deleteCapturedPhotos();
}
