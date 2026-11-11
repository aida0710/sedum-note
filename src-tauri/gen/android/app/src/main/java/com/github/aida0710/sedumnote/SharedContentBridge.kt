package com.github.aida0710.sedumnote

import android.content.ContentResolver
import android.content.Intent
import android.net.Uri
import android.provider.OpenableColumns
import android.util.Base64
import android.webkit.JavascriptInterface
import androidx.core.content.IntentCompat
import java.io.InputStream
import org.json.JSONArray
import org.json.JSONObject

// ほかのアプリの「共有」で受け取った文字とファイルを、画面（WebView）へ渡す窓口。
//
// 受け取った文字とファイルの場所は、メモリにだけ持つ。メモはロックを解除するまで暗号化
// できないので、ここでディスクに写すと平文が残る。ファイルの中身は、画面が読みに来たときに
// 共有元から少しずつ読む。画面が受け取り終えたら clearPendingShare で忘れる。
class SharedContentBridge(private val contentResolver: ContentResolver) {
  private class SharedFile(val uri: Uri, val fileName: String, val mimeType: String, val byteLength: Long)
  private class PendingShare(val subject: String, val text: String, val files: List<SharedFile>)
  // 続きから読むために開いたままにする流れと、次に読む位置。
  private class OpenFile(val fileIndex: Int, val stream: InputStream, var position: Long)

  private var pendingShare: PendingShare? = null
  private var openFile: OpenFile? = null

  // 共有の Intent なら中身を覚えて true を返す。
  @Synchronized
  fun accept(intent: Intent): Boolean {
    val uris = when (intent.action) {
      Intent.ACTION_SEND -> listOfNotNull(IntentCompat.getParcelableExtra(intent, Intent.EXTRA_STREAM, Uri::class.java))
      Intent.ACTION_SEND_MULTIPLE -> IntentCompat.getParcelableArrayListExtra(intent, Intent.EXTRA_STREAM, Uri::class.java).orEmpty()
      else -> return false
    }
    closeOpenFile()
    pendingShare = PendingShare(
      subject = intent.getStringExtra(Intent.EXTRA_SUBJECT).orEmpty(),
      text = intent.getCharSequenceExtra(Intent.EXTRA_TEXT)?.toString().orEmpty(),
      files = uris.map(::describeFile),
    )
    return true
  }

  // 受け取った中身の説明（JSON）。無ければ空の文字列。ファイルの中身は readPendingFileChunk で読む。
  @JavascriptInterface
  @Synchronized
  fun describePendingShare(): String {
    val share = pendingShare ?: return ""
    val files = JSONArray()
    for (file in share.files) {
      files.put(JSONObject().put("fileName", file.fileName).put("mimeType", file.mimeType).put("byteLength", file.byteLength))
    }
    return JSONObject().put("subject", share.subject).put("text", share.text).put("files", files).toString()
  }

  // ファイルの offset から最大 length バイトを Base64 で返す。終わりに達したら空の文字列。
  @JavascriptInterface
  @Synchronized
  fun readPendingFileChunk(fileIndex: Int, offset: Double, length: Int): String {
    val file = pendingShare?.files?.getOrNull(fileIndex) ?: return ""
    val stream = streamAt(fileIndex, file, offset.toLong()) ?: return ""
    val buffer = ByteArray(length)
    var filled = 0
    while (filled < length) {
      val read = stream.stream.read(buffer, filled, length - filled)
      if (read < 0) {
        break
      }
      filled += read
    }
    stream.position += filled
    return Base64.encodeToString(buffer, 0, filled, Base64.NO_WRAP)
  }

  @JavascriptInterface
  @Synchronized
  fun clearPendingShare() {
    closeOpenFile()
    pendingShare = null
  }

  // 続きの位置なら開いてある流れを使い、違う位置なら開き直して読み飛ばす。
  private fun streamAt(fileIndex: Int, file: SharedFile, offset: Long): OpenFile? {
    openFile?.let { if (it.fileIndex == fileIndex && it.position == offset) return it }
    closeOpenFile()
    val stream = contentResolver.openInputStream(file.uri) ?: return null
    var skipped = 0L
    while (skipped < offset) {
      val step = stream.skip(offset - skipped)
      if (step <= 0) {
        break
      }
      skipped += step
    }
    return OpenFile(fileIndex, stream, skipped).also { openFile = it }
  }

  private fun closeOpenFile() {
    openFile?.stream?.close()
    openFile = null
  }

  private fun describeFile(uri: Uri): SharedFile {
    var fileName = uri.lastPathSegment ?: "file"
    // 大きさが分からない共有元もある。そのときは -1。
    var byteLength = -1L
    contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE), null, null, null)?.use { cursor ->
      if (cursor.moveToFirst()) {
        val nameColumn = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
        val sizeColumn = cursor.getColumnIndex(OpenableColumns.SIZE)
        if (nameColumn >= 0 && !cursor.isNull(nameColumn)) {
          fileName = cursor.getString(nameColumn)
        }
        if (sizeColumn >= 0 && !cursor.isNull(sizeColumn)) {
          byteLength = cursor.getLong(sizeColumn)
        }
      }
    }
    return SharedFile(uri, fileName, contentResolver.getType(uri) ?: "application/octet-stream", byteLength)
  }
}
