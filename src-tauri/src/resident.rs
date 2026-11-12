// ウィンドウを閉じても、アプリを動かしたままにする（常駐）。閉じている間も、期限の通知を出せるようにするためのもの。
// 入れるかどうかは画面の設定で決め、画面から set_resident で伝わる。入れている間は、ウィンドウを閉じる操作で
// ウィンドウを隠すだけにし、通知の領域（Mac はメニューバー）のアイコンから開き直す・終了する。
// Windows と Mac だけにある（Linux は、常駐のアイコンに追加のライブラリが要るので入れていない）。

use std::sync::atomic::{AtomicBool, Ordering};

use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, State, Window, WindowEvent};

const TRAY_ICON_ID: &str = "resident";
const SHOW_MENU_ITEM_ID: &str = "show";
const QUIT_MENU_ITEM_ID: &str = "quit";
const MAIN_WINDOW_LABEL: &str = "main";

#[derive(Default)]
pub struct ResidentState {
  enabled: AtomicBool,
}

// 隠したウィンドウを出して、前に持ってくる。
pub fn show_main_window(app: &AppHandle) {
  if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
    let _ = window.show();
    let _ = window.unminimize();
    let _ = window.set_focus();
  }
}

// 常駐を入れている間は、ウィンドウを閉じる操作で、終了せずにウィンドウを隠す。
pub fn hide_instead_of_closing(window: &Window, event: &WindowEvent) {
  if let WindowEvent::CloseRequested { api, .. } = event {
    if window.state::<ResidentState>().enabled.load(Ordering::Relaxed) {
      api.prevent_close();
      let _ = window.hide();
    }
  }
}

// 常駐を入れる・切る。メニューの文言は、画面の言語に合わせて画面から渡す。
#[tauri::command]
pub fn set_resident(app: AppHandle, state: State<ResidentState>, enabled: bool, show_label: String, quit_label: String) -> Result<(), String> {
  state.enabled.store(enabled, Ordering::Relaxed);
  let menu = resident_menu(&app, &show_label, &quit_label).map_err(|error| error.to_string())?;
  if let Some(tray) = app.tray_by_id(TRAY_ICON_ID) {
    tray.set_menu(Some(menu)).map_err(|error| error.to_string())?;
    return tray.set_visible(enabled).map_err(|error| error.to_string());
  }
  if !enabled {
    return Ok(());
  }
  let mut tray = TrayIconBuilder::with_id(TRAY_ICON_ID)
    .menu(&menu)
    // 左クリックではウィンドウを開き、メニューは右クリックで出す。
    .show_menu_on_left_click(false)
    .on_menu_event(|app, event| match event.id().as_ref() {
      SHOW_MENU_ITEM_ID => show_main_window(app),
      QUIT_MENU_ITEM_ID => app.exit(0),
      _ => {}
    })
    .on_tray_icon_event(|tray, event| {
      if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
        show_main_window(tray.app_handle());
      }
    });
  if let Some(icon) = app.default_window_icon() {
    tray = tray.icon(icon.clone());
  }
  tray.build(&app).map(|_| ()).map_err(|error| error.to_string())
}

fn resident_menu(app: &AppHandle, show_label: &str, quit_label: &str) -> tauri::Result<Menu<tauri::Wry>> {
  let show = MenuItem::with_id(app, SHOW_MENU_ITEM_ID, show_label, true, None::<&str>)?;
  let quit = MenuItem::with_id(app, QUIT_MENU_ITEM_ID, quit_label, true, None::<&str>)?;
  Menu::with_items(app, &[&show, &quit])
}
