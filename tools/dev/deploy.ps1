param(
  [Parameter(Mandatory = $true)][string]$BackendDir,
  [Parameter(Mandatory = $true)][string]$RpcUrl,
  [Parameter(Mandatory = $true)][string]$DeployScript
)

$ErrorActionPreference = "Stop"

# Repo root is two levels up from tools/dev/
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\\..")

Push-Location $BackendDir
try {
  # Foundry now requires an explicit sender/private key for broadcast.
  # Prefer env-provided key; fall back to Anvil account (0) dev key.
  $pk = $env:DEPLOY_PRIVATE_KEY
  if (-not $pk) { $pk = $env:FOUNDRY_PRIVATE_KEY }
  if (-not $pk) { $pk = $env:PRIVATE_KEY }
  if (-not $pk) { $pk = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" }

  # Deploy (broadcast) and capture output
  $out = (& forge script $DeployScript --rpc-url $RpcUrl --broadcast --private-key $pk 2>&1) -join "`n"

  # Prefer reading the broadcast artifact (stable across Foundry versions).
  # Example: flower-backend/broadcast/Deploy.s.sol/31337/run-latest.json
  $broadcastDir = Join-Path (Get-Location) "broadcast"
  $runLatest = Get-ChildItem -Path $broadcastDir -Filter "run-latest.json" -Recurse -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1

  $addr = $null
  if ($runLatest) {
    $json = Get-Content $runLatest.FullName -Raw | ConvertFrom-Json
    $tx = $json.transactions | Where-Object {
      $_.transactionType -eq "CREATE" -and $_.contractAddress -and ($_.contractName -eq "FlowerNFT" -or $_.contractName)
    } | Select-Object -First 1
    if ($tx -and $tx.contractAddress) {
      $addr = [string]$tx.contractAddress
    }
  }

  # Fallback: attempt to parse from stdout.
  if (-not $addr) {
    $addr = ([regex]::Match($out, "Deployed to:\s*(0x[a-fA-F0-9]{40})")).Groups[1].Value
  }
  if (-not $addr) {
    $addr = ([regex]::Match($out, 'contractAddress"?\s*[:=]\s*"?\s*(0x[a-fA-F0-9]{40})')).Groups[1].Value
  }
  if (-not $addr) {
    Write-Host $out
    throw "Could not determine deployed contract address (no broadcast run-latest.json and no stdout match)."
  }

  $envPath = Join-Path $repoRoot ".task.env"
  "NFT_CONTRACT_ADDRESS=$addr" | Set-Content -Encoding utf8 $envPath
  Write-Host "NFT_CONTRACT_ADDRESS=$addr"
}
finally {
  Pop-Location
}

