package com.github.aida0710.sedumnote

import android.app.Activity
import android.graphics.Color
import android.view.View
import android.webkit.JavascriptInterface
import androidx.core.view.WindowCompat

// 画面（WebView）が選んだテーマの色を、ステータスバーとナビゲーションバーの所に当てる窓口。
//
// WebView はシステムバーとキーボードの分だけ内側に置いている（MainActivity）ので、その外側には
// 窓の地の色が見える。窓の地は OS の明るさで決まるため、アプリで別の明るさのテーマを選ぶと
// 色が合わない。テーマが変わるたびに、画面側から色を受け取って塗り直す。
class SystemBarsBridge(private val activity: Activity) {
  // backgroundColor は #rrggbb。isDark なら、バーのアイコンを明るい色にする。
  @JavascriptInterface
  fun setSystemBarColors(backgroundColor: String, isDark: Boolean) {
    val color = try {
      Color.parseColor(backgroundColor)
    } catch (error: IllegalArgumentException) {
      return
    }
    activity.runOnUiThread {
      activity.window.decorView.setBackgroundColor(color)
      activity.findViewById<View>(android.R.id.content).setBackgroundColor(color)
      WindowCompat.getInsetsController(activity.window, activity.window.decorView).apply {
        isAppearanceLightStatusBars = !isDark
        isAppearanceLightNavigationBars = !isDark
      }
    }
  }
}
