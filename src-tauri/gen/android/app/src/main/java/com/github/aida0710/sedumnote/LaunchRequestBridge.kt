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

// ウィジェットとショートカットが「新しいメモ」を頼むときの Intent の action。AndroidManifest.xml と res/xml/shortcuts.xml と揃える。
const val ACTION_NEW_NOTE = "com.github.aida0710.sedumnote.action.NEW_NOTE"

// 読めなかったファイルの印。Base64 に出てこない文字にする。src/ui/platform/sharedContent.ts と揃える。
private const val UNREADABLE_FILE_MARK = "!"

// アプリの外から頼まれたこと（ほかのアプリの「共有」、ウィジェットやショートカットの「新しいメモ」）を、
// 画面（WebView）へ渡す窓口。アプリを開いていないときに頼まれたものも、画面が取りに来るまで覚えておく。
//
// 共有で受け取った文字とファイルの場所は、メモリにだけ持つ。メモはロックを解除するまで暗号化
// できないので、ここでディスクに写すと平文が残る。ファイルの中身は、画面が読みに来たときに
// 共有元から少しずつ読む。画面が受け取り終えたら clearPendingShare で忘れる。
class LaunchRequestBridge(private val contentResolver: ContentResolver) {
  private class SharedFile(val uri: Uri, val fileName: String, val mimeType: String, val byteLength: Long)
  private class PendingShare(val subject: String, val text: String, val files: List<SharedFile>)
  // 続きから読むために開いたままにする流れと、次に読む位置。
  private class OpenFile(val fileIndex: Int, val stream: InputStream, var position: Long)

  private var pendingShare: PendingShare? = null
  private var openFile: OpenFile? = null
  private var newNoteRequested = false

  // 頼まれごとの Intent（共有か、新しいメモ）なら覚えて true を返す。
  @Synchronized
  fun accept(intent: Intent): Boolean {
    if (intent.action == ACTION_NEW_NOTE) {
      newNoteRequested = true
      return true
    }
    val uris = when (intent.action) {
      Intent.ACTION_SEND -> listOfNotNull(IntentCompat.getParcelableExtra(intent, Intent.EXTRA_STREAM, Uri::class.java))
      Intent.ACTION_SEND_MULTIPLE -> IntentCompat.getParcelableArrayListExtra(intent, Intent.EXTRA_STREAM, Uri::class.java).orEmpty()
      else -> return false
    }
    closeOpenFile()
    pendingShare = PendingShare(
      subject = intent.getStringExtra(Intent.EXTRA_SUBJECT).orEmpty(),
      text = intent.getCharSequenceExtra(Intent.EXTRA_TEXT)?.toString().orEmpty(),
      files = uris.map { uri -> describeFile(uri, intent.type) },
    )
    return true
  }

  // 「新しいメモ」を頼まれていたら true を返し、頼まれごとを忘れる。
  @JavascriptInterface
  @Synchronized
  fun takeNewNoteRequest(): Boolean {
    val requested = newNoteRequested
    newNoteRequested = false
    return requested
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
  // 読めなかったとき（共有元が読む許可を付けていない、ファイルが消えた、など）は UNREADABLE_FILE_MARK。
  // null は、画面側では null にならない（undefined で届く）ので、文字列の印で伝える。
  @JavascriptInterface
  @Synchronized
  fun readPendingFileChunk(fileIndex: Int, offset: Double, length: Int): String {
    val file = pendingShare?.files?.getOrNull(fileIndex) ?: return UNREADABLE_FILE_MARK
    return try {
      val stream = streamAt(fileIndex, file, offset.toLong()) ?: return UNREADABLE_FILE_MARK
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
      Base64.encodeToString(buffer, 0, filled, Base64.NO_WRAP)
    } catch (error: Exception) {
      closeOpenFile()
      UNREADABLE_FILE_MARK
    }
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

  // 名前・大きさ・種類は共有元に聞く。答えない共有元もあるので、分からない項目は既定の値にする。
  private fun describeFile(uri: Uri, intentType: String?): SharedFile {
    var fileName = uri.lastPathSegment ?: "file"
    // 大きさが分からないときは -1。
    var byteLength = -1L
    try {
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
    } catch (error: Exception) {
      // 読めない共有元。中身を読むときに、あらためて読めないことが分かる。
    }
    // 共有元が種類を答えなければ、Intent に書かれた種類を使う（image/* のような範囲の指定は使えない）。
    val mimeType = contentResolver.getType(uri) ?: intentType?.takeUnless { it.contains('*') } ?: "application/octet-stream"
    return SharedFile(uri, fileName, mimeType, byteLength)
  }
}
