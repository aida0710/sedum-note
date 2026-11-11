package com.github.aida0710.sedumnote

import android.app.Activity
import android.os.Environment
import android.webkit.JavascriptInterface

// カメラで撮った写真の一時ファイルを消す窓口。
//
// 本文の「その場で撮る」は、撮った写真をアプリ専用のフォルダ（外部ストレージの Pictures）に
// 暗号化されない一時ファイルとして受け取る。画面がその中身を暗号化して添付にしたあとも、
// ファイルは残る。メモは暗号化して保存するアプリなので、添付にし終えたら、画面からここを呼んで消す。
class CapturedPhotosBridge(private val activity: Activity) {
  @JavascriptInterface
  fun deleteCapturedPhotos() {
    activity.getExternalFilesDir(Environment.DIRECTORY_PICTURES)?.listFiles()?.forEach { file ->
      // WebView のファイルの選択（Tauri が生成した RustWebChromeClient）が付ける名前。
      if (file.isFile && file.name.startsWith("JPEG_")) {
        file.delete()
      }
    }
  }
}
