# Windows PowerShell 5.1 が日本語のコメントを読み違えないよう、このファイルは BOM 付きの UTF-8 で保存する。
# Windows の試験用の VM で、PowerShell のスクリプトを、ログオン中の利用者の画面（デスクトップ）の中で動かす。
# SSH のセッションからは、画面を撮ることも、ウィンドウを閉じることもできないので、対話のログオンのタスクとして動かす。
# 終わるまで待ち、スクリプトの出力を返す。手で流す確認の道具。
#
# 使い方: powershell -File runInDesktopSession.ps1 -Script <動かす .ps1>
param([Parameter(Mandatory = $true)][string]$Script)
$ErrorActionPreference = "Stop"

$taskName = "sedum-note-desktop-session"
$log = Join-Path $PSScriptRoot "desktop-session.log"
Remove-Item $log -ErrorAction SilentlyContinue
# ウィンドウを出さずに動かす（撮る画面に、この道具のウィンドウが写らないように）。
# スクリプトが途中で止まったときの理由は、出力の向け先に入らないので、受けて記録に足す。
$command = "try { & '$Script' *> '$log' } catch { `$_ | Out-String | Add-Content '$log'; exit 1 }"
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -Command `"$command`""
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive
Register-ScheduledTask -TaskName $taskName -Action $action -Principal $principal -Force | Out-Null
Start-ScheduledTask -TaskName $taskName
# タスクが終わる（状態が Running でなくなる）のを待つ。
while ((Get-ScheduledTask -TaskName $taskName).State -eq "Running") {
  Start-Sleep -Milliseconds 300
}
if (Test-Path $log) {
  Get-Content $log
}
