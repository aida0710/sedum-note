# Windows PowerShell 5.1 が日本語のコメントを読み違えないよう、このファイルは BOM 付きの UTF-8 で保存する。
# 画面の全体（通知や、通知の領域のアイコンを含む）を、このファイルと同じフォルダの screen.png に撮る。runInDesktopSession.ps1 から、利用者の画面の中で動かす。
$ErrorActionPreference = "Stop"
$Out = Join-Path $PSScriptRoot "screen.png"
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$bitmap = New-Object System.Drawing.Bitmap $bounds.Width, $bounds.Height
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size)
$bitmap.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png)
$graphics.Dispose()
$bitmap.Dispose()
Write-Output "captured $Out"
