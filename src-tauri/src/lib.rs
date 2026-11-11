#[cfg(desktop)]
mod mcp_gateway;
#[cfg(desktop)]
mod printing;
#[cfg(all(desktop, feature = "update-rehearsal"))]
mod update_rehearsal;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  let builder = tauri::Builder::default();
  // 画面から呼ぶコマンドは、デスクトップにだけある（MCP の窓口と印刷）。Android のアプリは、裏に回ると
  // 止められるので窓口を開けず、印刷の画面を出す手段も無い。
  #[cfg(desktop)]
  let builder = builder.manage(mcp_gateway::McpGatewayState::default()).invoke_handler(tauri::generate_handler![
    mcp_gateway::mcp_start,
    mcp_gateway::mcp_stop,
    mcp_gateway::mcp_set_token,
    mcp_gateway::mcp_respond,
    printing::print_window
  ]);
  builder
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_fs::init())
    .plugin(tauri_plugin_opener::init())
    .plugin(tauri_plugin_http::init())
    .setup(|app| {
      // アプリが自分を更新できるのはデスクトップだけ。Android は、更新を知らせてリリースのページを開く。
      #[cfg(desktop)]
      {
        app.handle().plugin(tauri_plugin_updater::Builder::new().build())?;
        app.handle().plugin(tauri_plugin_process::init())?;
      }
      #[cfg(all(desktop, feature = "update-rehearsal"))]
      update_rehearsal::run(app.handle().clone());
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while building tauri application");
}
