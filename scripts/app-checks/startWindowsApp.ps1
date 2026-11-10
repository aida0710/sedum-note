# Windows PowerShell 5.1 が日本語のコメントを読み違えないよう、このファイルは BOM 付きの UTF-8 で保存する。
# Windows の試験用の VM で、アプリを起動する。-Installer を渡せば先に黙って入れる。
# 外から操作するには、CI の確認用のビルド（成果物 sedum-note-Windows-check、DevTools を
# 127.0.0.1:9222 に開く）を -App に渡す。配布するビルドは DevTools を開かない。
# SSH のセッションからは画面に起動できないので、ログオン中の利用者の対話のタスクとして起動する。
# -Fresh を付けると、アプリの保存（WebView2 の IndexedDB）を消してから起動する。手で流す確認の道具。
#
# 使い方: powershell -File startWindowsApp.ps1 -Installer <setup.exe>
#         powershell -File startWindowsApp.ps1 -App <確認用の sedum-note.exe> -Fresh
param(
  [string]$Installer,
  [string]$App,
  [switch]$Fresh
)
$ErrorActionPreference = "Stop"

if ($Installer) {
  Start-Process -FilePath $Installer -ArgumentList "/S" -Wait
}
if (-not $App) {
  $App = Join-Path $env:LOCALAPPDATA "Sedum Note\sedum-note.exe"
}
if (-not (Test-Path $App)) {
  throw "sedum-note.exe was not found at $App"
}
Stop-Process -Name sedum-note -Force -ErrorAction SilentlyContinue
if ($Fresh) {
  Start-Sleep 2
  Remove-Item (Join-Path $env:LOCALAPPDATA "com.github.aida0710.sedumnote") -Recurse -Force -ErrorAction SilentlyContinue
}

$launcher = Join-Path $env:TEMP "start-sedum-note.cmd"
Set-Content -Path $launcher -Encoding ASCII -Value @("start """" ""$App""")
# 対話のログオンのタスクなら、SSH のセッションからでもパスワードなしでログオン中の画面に起動できる。
$taskName = "sedum-note-check"
$action = New-ScheduledTaskAction -Execute "cmd.exe" -Argument "/c `"$launcher`""
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive
Register-ScheduledTask -TaskName $taskName -Action $action -Principal $principal -Force | Out-Null
Start-ScheduledTask -TaskName $taskName
Write-Output "started $App"
