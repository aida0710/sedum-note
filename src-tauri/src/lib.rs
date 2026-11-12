#[cfg(desktop)]
mod mcp_gateway;
#[cfg(desktop)]
mod printing;
#[cfg(any(target_os = "windows", target_os = "macos"))]
mod resident;
#[cfg(all(desktop, feature = "update-rehearsal"))]
mod update_rehearsal;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  let builder = tauri::Builder::default();
  // 画面から呼ぶコマンドは、デスクトップにだけある（MCP の窓口と印刷）。Android のアプリは、裏に回ると
  // 止められるので窓口を開けず、印刷の画面を出す手段も無い。常駐は、Windows と Mac にだけある。
  #[cfg(all(desktop, not(any(target_os = "windows", target_os = "macos"))))]
  let builder = builder.manage(mcp_gateway::McpGatewayState::default()).invoke_handler(tauri::generate_handler![
    mcp_gateway::mcp_start,
    mcp_gateway::mcp_stop,
    mcp_gateway::mcp_set_token,
    mcp_gateway::mcp_respond,
    printing::print_window
  ]);
  #[cfg(any(target_os = "windows", target_os = "macos"))]
  let builder = builder
    .manage(mcp_gateway::McpGatewayState::default())
    .manage(resident::ResidentState::default())
    .on_window_event(resident::hide_instead_of_closing)
    .invoke_handler(tauri::generate_handler![
      mcp_gateway::mcp_start,
      mcp_gateway::mcp_stop,
      mcp_gateway::mcp_set_token,
      mcp_gateway::mcp_respond,
      printing::print_window,
      resident::set_resident
    ]);
  let app = builder
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_fs::init())
    .plugin(tauri_plugin_opener::init())
    .plugin(tauri_plugin_http::init())
    .plugin(tauri_plugin_notification::init())
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
    .build(tauri::generate_context!())
    .expect("error while building tauri application");
  app.run(|_app, _event| {
    // Mac では、ウィンドウを隠している間に Dock のアイコンを押されたら、ウィンドウを出す。
    #[cfg(target_os = "macos")]
    if let tauri::RunEvent::Reopen { has_visible_windows: false, .. } = _event {
      resident::show_main_window(_app);
    }
  });
}
