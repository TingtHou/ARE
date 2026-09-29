# Regenerates index.html (the standalone page for GitHub/AWS) from are-study-system.html.
# Run after changing the page itself. Edits inside material/ need no rebuild.
$src = Get-Content -Raw -Encoding UTF8 "$PSScriptRoot\are-study-system.html"
$nl = $src.IndexOf("`n")
$title = $src.Substring(0, $nl).Trim()
$body = $src.Substring($nl + 1)
$head = "<!doctype html>`n<html lang=""en""><head><meta charset=""utf-8""><meta name=""viewport"" content=""width=device-width,initial-scale=1,viewport-fit=cover"">`n$title`n<style>:root{box-sizing:border-box}body{margin:0;padding:0}img{max-width:100%}[hidden]{display:none!important}</style>`n</head><body>`n"
$out = $head + $body + "`n</body></html>`n"
[IO.File]::WriteAllText("$PSScriptRoot\index.html", $out, (New-Object Text.UTF8Encoding $false))
"index.html rebuilt"
