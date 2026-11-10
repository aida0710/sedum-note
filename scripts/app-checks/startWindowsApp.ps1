# Windows の試験用の VM で、CI が作ったインストーラーを黙って入れ、WebView2 の DevTools を
# 開いた状態でアプリを起動する。SSH のセッションからは画面に起動できないので、
# ログオン中の利用者の対話のタスクとして起動する。手で流す確認の道具。
#
# 使い方: powershell -File startWindowsApp.ps1 -Installer C:\Users\<名前>\memo-app-setup.exe
param(
  [Parameter(Mandatory = $true)][string]$Installer,
  # WebView2 の DevTools を開く VM の中のポート。手元へは ssh -L で転送する。
  [int]$DebugPort = 9222
)
$ErrorActionPreference = "Stop"

Start-Process -FilePath $Installer -ArgumentList "/S" -Wait
$app = Join-Path $env:LOCALAPPDATA "memo-app\memo-app.exe"
if (-not (Test-Path $app)) {
  $app = Join-Path $env:ProgramFiles "memo-app\memo-app.exe"
}
if (-not (Test-Path $app)) {
  throw "memo-app.exe was not installed where expected"
}

$launcher = Join-Path $env:TEMP "start-memo-app.cmd"
Set-Content -Path $launcher -Encoding ASCII -Value @(
  "set WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=$DebugPort",
  "start """" ""$app"""
)
$taskName = "memo-app-check"
schtasks /Create /F /TN $taskName /TR $launcher /SC ONCE /ST 00:00 /RU $env:USERNAME /IT | Out-Null
schtasks /Run /TN $taskName | Out-Null
Write-Output "started $app with DevTools on port $DebugPort"
