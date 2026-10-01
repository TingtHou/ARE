# Copies aws/connector.js and aws/chatgpt.js into their functions' inline code in aws/are-accounts.yaml,
# so the template stays a single file you can upload to CloudFormation.
$ErrorActionPreference = 'Stop'
$yamlPath = Join-Path $PSScriptRoot 'are-accounts.yaml'
$lines = ([IO.File]::ReadAllText($yamlPath) -replace "`r`n", "`n") -split "`n"
foreach ($name in 'connector', 'chatgpt') {
  $code = [IO.File]::ReadAllText((Join-Path $PSScriptRoot "$name.js")) -replace "`r`n", "`n"
  $start = [Array]::FindIndex($lines, [Predicate[string]]{ param($l) $l -match "ZipFile: \|\s+# built from aws/$name\.js" })
  $end = [Array]::FindIndex($lines, [Predicate[string]]{ param($l) $l -eq "  # end of $name code" })
  if ($start -lt 0 -or $end -le $start) { throw "Markers for $name.js not found in are-accounts.yaml" }
  $body = ($code.TrimEnd("`n") -split "`n") | ForEach-Object { if ($_ -eq '') { '' } else { '          ' + $_ } }
  $lines = @($lines[0..$start]) + @($body) + @($lines[$end..($lines.Length - 1)])
  "are-accounts.yaml: $name code updated ($($body.Count) lines)"
}
[IO.File]::WriteAllText($yamlPath, ($lines -join "`n"), (New-Object Text.UTF8Encoding $false))
