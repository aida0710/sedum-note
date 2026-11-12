# Windows PowerShell 5.1 が日本語のコメントを読み違えないよう、このファイルは BOM 付きの UTF-8 で保存する。
# アプリが Windows に出した通知（通知の一覧に残っているもの）の中身を、このファイルと同じフォルダの toasts.txt に書く。
# runInDesktopSession.ps1 から、利用者の画面の中で動かす。通知は、アプリをインストーラーで入れてあるときだけ出る。
$ErrorActionPreference = "Stop"
$appId = "com.github.aida0710.sedumnote"
[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
$toasts = [Windows.UI.Notifications.ToastNotificationManager]::History.GetHistory($appId) | ForEach-Object { $_.Content.GetXml() }
[System.IO.File]::WriteAllLines((Join-Path $PSScriptRoot "toasts.txt"), [string[]]@($toasts))
