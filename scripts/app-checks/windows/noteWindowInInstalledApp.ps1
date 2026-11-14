# Windows PowerShell 5.1 が日本語のコメントを読み違えないよう、このファイルは BOM 付きの UTF-8 で保存する。
# 配布するビルド（インストーラーで入れたアプリ。DevTools の口は無い）で、メモを別のウィンドウで開けるかを確かめる。
# 確認用のビルドは、DevTools の引数が最初のウィンドウにだけ付くので、別のウィンドウを作れない（WebView2 は、
# 同じ保存先を使うウィンドウの引数が揃っていないと断る）。そのため、ここでは画面の部品を UI Automation で押す。
# runInDesktopSession.ps1 から、利用者の画面の中で動かす。途中の画面を、このファイルと同じフォルダに撮る。
#
# 前提: アプリに、題が「買い物」のメモが入っている（pluginOnWindows.mjs を流したあとの状態）。
#       画面は日本語。パスフレーズは scripts/app-checks/checkDevices.mjs の PASSPHRASE。
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -AssemblyName System.Windows.Forms
$passphrase = "correct horse battery"
$noteTitle = "買い物"
$app = Join-Path $env:LOCALAPPDATA "Sedum Note\sedum-note.exe"
$automation = [System.Windows.Automation.AutomationElement]
$scope = [System.Windows.Automation.TreeScope]::Descendants

function Get-AppWindows {
  $ofApp = New-Object System.Windows.Automation.PropertyCondition $automation::ProcessIdProperty, $script:appProcess.Id
  return $automation::RootElement.FindAll([System.Windows.Automation.TreeScope]::Children, $ofApp)
}

# 名前の付いた部品が出るまで待つ。部品の種類は問わない（メニューの項目は、印の付くものと付かないもので種類が違う）。
function Wait-Element($window, [string]$name) {
  $condition = New-Object System.Windows.Automation.PropertyCondition $automation::NameProperty, $name
  for ($attempt = 0; $attempt -lt 60; $attempt++) {
    $found = $window.FindAll($scope, $condition)
    if ($found.Count -gt 0) { return $found[$found.Count - 1] }
    Start-Sleep -Milliseconds 500
  }
  throw "the element was not found: $name"
}

# 部品を、マウスで左クリックする（部品によっては、UI Automation の「押す」を受け付けない）。
Add-Type -Namespace SedumNoteCheck -Name User32 -MemberDefinition @"
[DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
[DllImport("user32.dll")] public static extern bool SetForegroundWindow(System.IntPtr window);
[DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint dx, uint dy, uint data, System.UIntPtr extraInfo);
"@
$MOUSE_LEFT_DOWN = 0x0002
$MOUSE_LEFT_UP = 0x0004
function Invoke-Element($element) {
  $bounds = $element.Current.BoundingRectangle
  [SedumNoteCheck.User32]::SetCursorPos([int]($bounds.X + $bounds.Width / 2), [int]($bounds.Y + $bounds.Height / 2)) | Out-Null
  [SedumNoteCheck.User32]::mouse_event($MOUSE_LEFT_DOWN, 0, 0, 0, [System.UIntPtr]::Zero)
  [SedumNoteCheck.User32]::mouse_event($MOUSE_LEFT_UP, 0, 0, 0, [System.UIntPtr]::Zero)
  Start-Sleep -Milliseconds 300
}

# ロックの画面で、パスフレーズを打って解除する。キーボードから打つ（欄に値を入れるだけでは、画面が入力に気づかない）。
function Unlock-Window($window) {
  $field = Wait-Element $window "パスフレーズ"
  $field.SetFocus()
  Start-Sleep -Milliseconds 500
  [System.Windows.Forms.SendKeys]::SendWait($passphrase + "{ENTER}")
}

function Save-Screen([string]$name) {
  & (Join-Path $PSScriptRoot "captureScreen.ps1") | Out-Null
  Move-Item (Join-Path $PSScriptRoot "screen.png") (Join-Path $PSScriptRoot "$name.png") -Force
}

Stop-Process -Name sedum-note -Force -ErrorAction SilentlyContinue
$script:appProcess = Start-Process $app -PassThru
Start-Sleep -Seconds 5
$main = (Get-AppWindows)[0]
Unlock-Window $main
Invoke-Element (Wait-Element $main $noteTitle)
Invoke-Element (Wait-Element $main "その他の操作")
Invoke-Element (Wait-Element $main "別のウィンドウで開く")

# 1. ウィンドウが 2 つになる。
for ($attempt = 0; (Get-AppWindows).Count -lt 2; $attempt++) {
  if ($attempt -ge 40) { Save-Screen "note-window-not-opened"; throw "the note window did not appear" }
  Start-Sleep -Milliseconds 500
}
$noteWindow = Get-AppWindows | Where-Object { $_.Current.NativeWindowHandle -ne $main.Current.NativeWindowHandle } | Select-Object -First 1
Write-Output "ok: a second window opened"

# 2. 最初のウィンドウのキーを受け取り、パスフレーズを聞かずに、そのメモが出て、ウィンドウの名前がメモの題になる。
for ($attempt = 0; $noteWindow.Current.Name -eq "Sedum Note" -or $noteWindow.Current.Name -eq ""; $attempt++) {
  if ($attempt -ge 40) { Save-Screen "note-window-not-unlocked"; throw "the note window did not show the note" }
  Start-Sleep -Milliseconds 500
}
Save-Screen "note-window"
Write-Output "ok: the note window shows the note without asking for the passphrase (window name: $($noteWindow.Current.Name))"

# 3. 最前面に固定する。固定したウィンドウは、最初のウィンドウを前に出しても、その上に残る。
Invoke-Element (Wait-Element $noteWindow "その他の操作")
Invoke-Element (Wait-Element $noteWindow "ウィンドウを最前面に固定")
Start-Sleep -Seconds 1
[SedumNoteCheck.User32]::SetForegroundWindow([System.IntPtr]$main.Current.NativeWindowHandle) | Out-Null
Start-Sleep -Seconds 1
Save-Screen "note-window-on-top"
Write-Output "ok: asked to keep the note window on top (see note-window-on-top.png)"
