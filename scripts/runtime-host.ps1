$ErrorActionPreference='Stop'
$taskProject=Split-Path -Parent $PSScriptRoot
$taskInstall=Get-Content -LiteralPath (Join-Path $taskProject 'runtime\lmstudio\.internal\llmster-install-location.json') -Raw | ConvertFrom-Json
$taskRuntime=[System.IO.Path]::GetFullPath($taskInstall.path)
$taskAllowed=[System.IO.Path]::GetFullPath((Join-Path $taskProject 'runtime\lmstudio\llmster'))+[System.IO.Path]::DirectorySeparatorChar
if(-not $taskRuntime.StartsWith($taskAllowed,[System.StringComparison]::OrdinalIgnoreCase)){throw 'Runtime escaped project directory'}
$taskLogs=Join-Path $taskProject 'data\runtime-logs'
New-Item -ItemType Directory -Path $taskLogs -Force | Out-Null
# The direct console child inherits this GUI-hosted hidden console.
Set-Location -LiteralPath $taskInstall.cwd
$ErrorActionPreference='Continue'
& $taskRuntime 2>&1 | Out-File -LiteralPath (Join-Path $taskLogs 'daemon.log') -Append
exit $LASTEXITCODE
