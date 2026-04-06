param(
  [Parameter(Mandatory = $true)][string]$BackendDir,
  [Parameter(Mandatory = $true)][string]$ChainId
)

$ErrorActionPreference = "Stop"

# Repo root is two levels up from tools/dev/
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\\..")
$envFile = Join-Path $repoRoot ".task.env"

if (Test-Path $envFile) {
  Get-Content $envFile | ForEach-Object {
    if ($_ -match "^(.*?)=(.*)$") {
      [Environment]::SetEnvironmentVariable($matches[1], $matches[2])
    }
  }
}

[Environment]::SetEnvironmentVariable("CHAIN_ID", $ChainId)

Push-Location $BackendDir
try {
  go run .\cmd\server\
}
finally {
  Pop-Location
}

