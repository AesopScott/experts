$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$htmlFiles = Get-ChildItem -Path $root -Filter "*.html" -File |
  Where-Object {
    $_.Name -notmatch "mockup" -and
    $_.Name -notin @("index_codex.html", "nav-mockups.html", "nav-style-mockups.html", "nav-gold-shimmer-mockups.html", "nav-gold-trails.html", "favicon-og-options.html", "h1-mockups.html")
  }

$missing = @()
$badVersion = @()
$badDate = @()

foreach ($file in $htmlFiles) {
  $content = Get-Content -Raw -Path $file.FullName
  if ($content -notmatch '<meta name="page-version" content="([^"]+)">') {
    $missing += "$($file.Name): page-version"
  } elseif ($matches[1] -notmatch '^v\d{4}\.\d{2}\.\d{2}\.\d+$') {
    $badVersion += "$($file.Name): $($matches[1])"
  }

  if ($content -notmatch '<meta name="page-updated" content="([^"]+)">') {
    $missing += "$($file.Name): page-updated"
  } elseif ($matches[1] -notmatch '^\d{4}-\d{2}-\d{2}$') {
    $badDate += "$($file.Name): $($matches[1])"
  }

  if ($content -notmatch '<meta name="version-policy"') {
    $missing += "$($file.Name): version-policy"
  }
}

if ($missing.Count -or $badVersion.Count -or $badDate.Count) {
  Write-Host "Page version check failed." -ForegroundColor Red
  if ($missing.Count) {
    Write-Host "`nMissing tags:" -ForegroundColor Yellow
    $missing | ForEach-Object { Write-Host "  $_" }
  }
  if ($badVersion.Count) {
    Write-Host "`nBad version values:" -ForegroundColor Yellow
    $badVersion | ForEach-Object { Write-Host "  $_" }
  }
  if ($badDate.Count) {
    Write-Host "`nBad date values:" -ForegroundColor Yellow
    $badDate | ForEach-Object { Write-Host "  $_" }
  }
  exit 1
}

Write-Host "Page version check passed for $($htmlFiles.Count) live pages." -ForegroundColor Green
