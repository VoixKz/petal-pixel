param(
  [Parameter(Mandatory = $false)][string]$Ports = "8545,50051,8080,5173"
)

$ErrorActionPreference = "Continue"

$portList = $Ports -split ","

foreach ($port in $portList) {
  $port = $port.Trim()
  Write-Host "Checking port $port..."
  $connections = netstat -ano | Select-String ":$port\s"
  foreach ($line in $connections) {
    $parts = $line -split "\s+" | Where-Object { $_ -ne "" }
    if ($parts.Count -ge 5) {
      $pid = $parts[-1]
      if ($pid -match "^\d+$" -and $pid -ne "0") {
        try {
          $proc = Get-Process -Id $pid -ErrorAction SilentlyContinue
          if ($proc) {
            Write-Host "  Stopping PID $pid ($($proc.Name)) on port $port"
            Stop-Process -Id $pid -Force
          }
        } catch {
          Write-Host "  Could not stop PID $pid : $_"
        }
      }
    }
  }
}

Write-Host "Done."
