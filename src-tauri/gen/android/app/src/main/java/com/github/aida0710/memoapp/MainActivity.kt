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

  // edge-to-edge では、キーボードが開いても WebView が縮まず、画面の下に置いた書式の
  // ツールバーがキーボードに隠れる。キーボードの高さだけ下を空けて WebView を縮める。
  // 上と下のシステムバーの分は、画面の側で env(safe-area-inset-*) を使って空ける。
  private fun keepContentAboveKeyboard(content: View) {
    ViewCompat.setOnApplyWindowInsetsListener(content) { view, insets ->
      // キーボードの高さは画面の下端から測るので、ナビゲーションバーの分も入っている。
      view.setPadding(0, 0, 0, insets.getInsets(WindowInsetsCompat.Type.ime()).bottom)
      insets
    }
  }
}
