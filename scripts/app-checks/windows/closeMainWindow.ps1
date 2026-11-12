# Windows PowerShell 5.1 が日本語のコメントを読み違えないよう、このファイルは BOM 付きの UTF-8 で保存する。
# アプリの最初のウィンドウを、利用者が「×」を押したのと同じ形で閉じる。runInDesktopSession.ps1 から、利用者の画面の中で動かす。
# 常駐を入れていれば、アプリは終了せずに、ウィンドウが隠れるだけになる。
$ErrorActionPreference = "Stop"
$closed = 0
foreach ($process in Get-Process -Name sedum-note -ErrorAction SilentlyContinue) {
  if ($process.MainWindowHandle -ne 0 -and $process.CloseMainWindow()) {
    $closed += 1
  }
}
Write-Output "asked $closed window(s) to close"
