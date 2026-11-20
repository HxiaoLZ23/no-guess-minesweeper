# Build an offline zip: dist/no-guess-minesweeper-v{version}.zip
# Zip root contains index.html + start.bat (one playable folder layer).
$ErrorActionPreference = 'Stop'

$Root = Split-Path -Parent $PSScriptRoot
$PreparePs1 = Join-Path $PSScriptRoot 'prepare-static.ps1'
$SiteDir = Join-Path $Root 'dist\site'
$VersionPath = Join-Path $Root 'version.json'

# Ensure dist/site is fresh
& $PreparePs1

$versionInfo = Get-Content -Raw -Encoding UTF8 $VersionPath | ConvertFrom-Json
$version = [string]$versionInfo.version
if ([string]::IsNullOrWhiteSpace($version)) {
  throw 'version.json missing version'
}

$zipName = "no-guess-minesweeper-v$version.zip"
$zipPath = Join-Path $Root "dist\$zipName"
$stageRoot = Join-Path $Root 'dist\_offline_stage'
$stageDir = Join-Path $stageRoot "no-guess-minesweeper-v$version"

if (Test-Path $stageRoot) {
  Remove-Item -Recurse -Force $stageRoot
}
New-Item -ItemType Directory -Path $stageDir -Force | Out-Null

Copy-Item -Recurse -Force (Join-Path $SiteDir '*') $stageDir

$readme = @"
No Guess Minesweeper — Offline Pack / 离线包

EN:
- Double-click index.html to play in your browser, or run start.bat for a local server.
- Cloud features need network; offline they degrade gracefully.

中文：
- 双击 index.html 用浏览器打开，或运行 start.bat 启动本地服务。
- 云功能需联网；无网时自动降级为本地模式。

Version: $version
"@

$readmePath = Join-Path $stageDir 'README.txt'
# UTF-8 with BOM helps Notepad on Windows show Chinese correctly
$utf8Bom = New-Object System.Text.UTF8Encoding $true
[System.IO.File]::WriteAllText($readmePath, $readme.TrimStart() + "`r`n", $utf8Bom)

if (Test-Path $zipPath) {
  Remove-Item -Force $zipPath
}

Compress-Archive -Path $stageDir -DestinationPath $zipPath -Force
Remove-Item -Recurse -Force $stageRoot

Write-Host "Created $zipPath"
Get-Item $zipPath | Select-Object FullName, Length | Format-List
