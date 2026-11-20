# Prepare a playable static site under dist/site (Windows PowerShell).
# Idempotent: clears the output directory before copying.
$ErrorActionPreference = 'Stop'

$Root = Split-Path -Parent $PSScriptRoot
$Out = Join-Path $Root 'dist\site'

if (Test-Path $Out) {
  Remove-Item -Recurse -Force $Out
}
New-Item -ItemType Directory -Path $Out -Force | Out-Null

$files = @(
  'index.html',
  'styles.css',
  'sw.js',
  'manifest.json',
  'icon.svg',
  'version.json',
  'cloud.json',
  'start.bat'
)

foreach ($f in $files) {
  $src = Join-Path $Root $f
  if (Test-Path $src -PathType Leaf) {
    Copy-Item $src (Join-Path $Out $f)
  } else {
    Write-Warning "missing file $f"
  }
}

$jsSrc = Join-Path $Root 'js'
$assetsSrc = Join-Path $Root 'assets'
if (-not (Test-Path $jsSrc -PathType Container)) {
  throw "js/ not found"
}
if (-not (Test-Path $assetsSrc -PathType Container)) {
  throw "assets/ not found"
}

Copy-Item -Recurse $jsSrc (Join-Path $Out 'js')
Copy-Item -Recurse $assetsSrc (Join-Path $Out 'assets')

Write-Host "Prepared static site at $Out"
