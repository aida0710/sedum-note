// CI の更新の予行（.github/workflows/ci.yml）でだけ組み込む。配布するアプリには入らない。
//
// 起動したら、設定の更新元から新しいバージョンを取って入れ替え、終了コードで結果を返す。
// 画面の「更新して再起動」と同じプラグインの処理（確認・署名の検証・入れ替え）を通す。

use tauri::AppHandle;
use tauri_plugin_updater::UpdaterExt;

pub fn run(app: AppHandle) {
  tauri::async_runtime::spawn(async move {
    let exit_code = match install_available_update(&app).await {
      Ok(version) => {
        println!("update rehearsal: installed {version}");
        0
      }
      Err(message) => {
        eprintln!("update rehearsal: {message}");
        1
      }
    };
    app.exit(exit_code);
  });
}

async fn install_available_update(app: &AppHandle) -> Result<String, String> {
  let updater = app.updater().map_err(|error| error.to_string())?;
  let update = updater
    .check()
    .await
    .map_err(|error| error.to_string())?
    .ok_or_else(|| "no update is available".to_string())?;
  update
    .download_and_install(|_, _| {}, || {})
    .await
    .map_err(|error| error.to_string())?;
  Ok(update.version)
}
