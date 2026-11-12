# Windows PowerShell 5.1 が日本語のコメントを読み違えないよう、このファイルは BOM 付きの UTF-8 で保存する。
# 通知の領域にある常駐のアイコンを、利用者が左クリックしたのと同じ形で押す（隠したウィンドウが開き直る）。
# runInDesktopSession.ps1 から、利用者の画面の中で動かす。アイコンは、隠れているアイコンの一覧の中にあることが多いので、
# 先に一覧を開く。
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
$root = [System.Windows.Automation.AutomationElement]::RootElement
$buttonType = [System.Windows.Automation.ControlType]::Button
$isButton = New-Object System.Windows.Automation.PropertyCondition ([System.Windows.Automation.AutomationElement]::ControlTypeProperty), $buttonType

# 通知の領域のボタンを、UI Automation の ID と、名前の先頭で探す。
function Find-TrayButton([string]$automationId, [string]$namePrefix) {
  foreach ($button in $root.FindAll([System.Windows.Automation.TreeScope]::Descendants, $isButton)) {
    if ($button.Current.AutomationId -eq $automationId -and $button.Current.Name.StartsWith($namePrefix)) {
      return $button
    }
  }
  return $null
}

# アプリのアイコンの名前は、アイコンのツールチップ（アプリの名前）。
$findAppIcon = { Find-TrayButton "NotifyItemIcon" "Sedum Note" }
$icon = & $findAppIcon
if ($null -eq $icon) {
  # 通知の領域の最初のボタンが、隠れているアイコンの一覧を開くボタン。
  $overflow = Find-TrayButton "SystemTrayIcon" ""
  if ($null -eq $overflow) { throw "the button that shows hidden icons was not found" }
  $overflow.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke()
  Start-Sleep -Seconds 2
  $icon = & $findAppIcon
}
if ($null -eq $icon) { throw "the icon of the app was not found in the notification area" }
$icon.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke()
Write-Output "pressed the icon: $($icon.Current.Name)"
