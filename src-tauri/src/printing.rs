// 開いている画面を、OS の印刷の画面へ送る（PDF での保存もそこから行う）。
// WebView の window.print() は OS によって動かない（macOS）ので、アプリの側から呼ぶ。

#[tauri::command]
pub fn print_window(window: tauri::WebviewWindow) -> Result<(), String> {
  window.print().map_err(|error| error.to_string())
}
