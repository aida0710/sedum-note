package com.github.aida0710.memoapp

import android.os.Bundle
import android.view.View
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    keepContentAboveKeyboard(findViewById(android.R.id.content))
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
