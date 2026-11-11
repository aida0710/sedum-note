package com.github.aida0710.sedumnote

import android.content.Intent
import android.os.Bundle
import android.view.View
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat

// 画面（WebView）から、外から頼まれたことの窓口を呼ぶときの名前。src/ui/platform/launchRequests.ts と揃える。
private const val LAUNCH_BRIDGE_NAME = "SedumNoteLaunch"
// 画面から、撮った写真の片付けの窓口を呼ぶときの名前。src/ui/platform/capturedPhotos.ts と揃える。
private const val CAPTURED_PHOTOS_BRIDGE_NAME = "SedumNoteCapturedPhotos"
// 画面からシステムバーの色の窓口を呼ぶときの名前。src/ui/platform/systemBars.ts と揃える。
private const val SYSTEM_BARS_BRIDGE_NAME = "SedumNoteSystemBars"
// 頼まれごとが届いたことを画面へ知らせるイベントの名前。launchRequests.ts と揃える。
private const val LAUNCH_REQUEST_EVENT = "sedum-note-launch-request"

class MainActivity : TauriActivity() {
  private lateinit var launchRequests: LaunchRequestBridge
  private var webView: WebView? = null

  override fun onCreate(savedInstanceState: Bundle?) {
    launchRequests = LaunchRequestBridge(contentResolver)
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    keepContentAboveKeyboard(findViewById(android.R.id.content))
    // 履歴から開き直したときと、画面を作り直したときは、前に受け取った Intent が残っている。二重に取り込まない。
    if (savedInstanceState == null && intent.flags and Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY == 0) {
      launchRequests.accept(intent)
    }
  }

  override fun onWebViewCreate(webView: WebView) {
    this.webView = webView
    webView.addJavascriptInterface(launchRequests, LAUNCH_BRIDGE_NAME)
    webView.addJavascriptInterface(CapturedPhotosBridge(this), CAPTURED_PHOTOS_BRIDGE_NAME)
    webView.addJavascriptInterface(SystemBarsBridge(this), SYSTEM_BARS_BRIDGE_NAME)
  }

  // アプリを開いたまま、共有されたとき・ウィジェットやショートカットが押されたとき。
  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    if (launchRequests.accept(intent)) {
      webView?.post { webView?.evaluateJavascript("window.dispatchEvent(new Event('$LAUNCH_REQUEST_EVENT'))", null) }
    }
  }

  // edge-to-edge では、WebView が画面いっぱいに広がり、ステータスバー・ナビゲーション
  // バーと重なる。キーボードが開いても縮まないので、下に置いた書式のツールバーも隠れる。
  // この WebView（Chrome 133）の env(safe-area-inset-*) は、WebView の大きさによって
  // 0 を返すことがあり当てにできないので、システムバーとキーボードの分をここで空ける。
  private fun keepContentAboveKeyboard(content: View) {
    ViewCompat.setOnApplyWindowInsetsListener(content) { view, insets ->
      val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout())
      // キーボードの高さは画面の下端から測るので、ナビゲーションバーの分も入っている。
      val keyboard = insets.getInsets(WindowInsetsCompat.Type.ime()).bottom
      view.setPadding(bars.left, bars.top, bars.right, maxOf(keyboard, bars.bottom))
      WindowInsetsCompat.CONSUMED
    }
  }
}
