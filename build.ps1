# Builds the study page from src/ and then the standalone index.html.
#   are-study-system.html  = src/01-head.html .. src/06-app.html joined in order (published to claude.ai)
#   index.html             = the same page with a full HTML header (served by GitHub / AWS Amplify)
# Run after editing anything in src/. Edits inside material/ need no rebuild.
$ErrorActionPreference = 'Stop'
$src = Join-Path $PSScriptRoot 'src'
$parts = Get-ChildItem $src -File | Where-Object { $_.Name -match '^\d\d-' } | Sort-Object Name
$sb = New-Object System.Text.StringBuilder
foreach ($p in $parts) { [void]$sb.Append([IO.File]::ReadAllText($p.FullName)) }
$utf8 = New-Object Text.UTF8Encoding $false
[IO.File]::WriteAllText((Join-Path $PSScriptRoot 'are-study-system.html'), $sb.ToString(), $utf8)
"are-study-system.html built from $($parts.Count) parts"
& (Join-Path $PSScriptRoot 'build-index.ps1')
& (Join-Path $PSScriptRoot 'aws\build-stack.ps1')
