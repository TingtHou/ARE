# Copies aws/connector.js into the ConnectorFunction's inline code in aws/are-accounts.yaml,
# so the template stays a single file you can upload to CloudFormation.
$ErrorActionPreference = 'Stop'
$yamlPath = Join-Path $PSScriptRoot 'are-accounts.yaml'
$code = [IO.File]::ReadAllText((Join-Path $PSScriptRoot 'connector.js')) -replace "`r`n", "`n"
$lines = ([IO.File]::ReadAllText($yamlPath) -replace "`r`n", "`n") -split "`n"
$start = [Array]::FindIndex($lines, [Predicate[string]]{ param($l) $l -match 'ZipFile: \|\s+# built from aws/connector\.js' })
$end = [Array]::FindIndex($lines, [Predicate[string]]{ param($l) $l -eq '  # end of connector code' })
if ($start -lt 0 -or $end -le $start) { throw 'Connector markers not found in are-accounts.yaml' }
$body = ($code.TrimEnd("`n") -split "`n") | ForEach-Object { if ($_ -eq '') { '' } else { '          ' + $_ } }
$out = @($lines[0..$start]) + @($body) + @($lines[$end..($lines.Length - 1)])
[IO.File]::WriteAllText($yamlPath, ($out -join "`n"), (New-Object Text.UTF8Encoding $false))
"are-accounts.yaml: connector code updated ($($body.Count) lines)"
