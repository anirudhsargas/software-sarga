# Stop repo-related processes and start backend then run pagination tests
$matches = Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -and ($_.CommandLine -match 'D:\\software sarga') }
if ($matches) {
  Write-Host "Found processes referencing repo:"
  $matches | Select-Object ProcessId,CommandLine | Format-Table -AutoSize
  foreach ($p in $matches) {
    try {
      Write-Host "Stopping PID $($p.ProcessId)"
      Stop-Process -Id $p.ProcessId -Force -ErrorAction Stop
    } catch {
      Write-Host "Failed to stop PID $($p.ProcessId): $($_.Exception.Message)"
    }
  }
} else {
  Write-Host "No repo-related processes to stop."
}

Write-Host "Starting backend (node server/index.js) in a new PowerShell window..."
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd 'D:\\software sarga\\server'; node index.js" -WindowStyle Normal

# Wait for /api/ping
Write-Host "Waiting for /api/ping..."
$success = $false
for ($i = 0; $i -lt 30; $i++) {
  try {
    $resp = Invoke-RestMethod -Uri 'http://localhost:5000/api/ping' -Method Get -TimeoutSec 3
    Write-Host "PING_OK: $($resp.status) DB:$($resp.db)"
    $success = $true
    break
  } catch {
    Write-Host "Waiting for server... ($i)"
    Start-Sleep -Seconds 2
  }
}
if (-not $success) { Write-Host "PING_TIMEOUT"; exit 1 }

# Generate JWT
$envFile = 'server\\.env'
$jwtLine = Select-String -Path $envFile -Pattern '^JWT_SECRET=' -ErrorAction SilentlyContinue
if (-not $jwtLine) { Write-Host 'JWT_SECRET not found in server\\.env'; exit 1 }
$jwt = ($jwtLine -split '=')[1].Trim()
Push-Location server
$env:JWT_SECRET = $jwt
$token = node -e "console.log(require('jsonwebtoken').sign({id:1,role:'Admin',branch_id:1,name:'Automation Test'}, process.env.JWT_SECRET, {expiresIn:'1h'}))"
Pop-Location
Write-Host "TOKEN:$token"

# Run pagination tests
$customerId = 1
$base = "http://localhost:5000/api/customers/$customerId/dashboard"
$tests = @(
  @{ q = "?page=1&limit=10"; name = "page=1,limit=10" },
  @{ q = "?page=0&limit=10"; name = "page=0" },
  @{ q = "?page=-5&limit=10"; name = "page=-5" },
  @{ q = "?page=abc&limit=10"; name = "page=abc" },
  @{ q = "?page=1&limit=0"; name = "limit=0" },
  @{ q = "?page=1&limit=500"; name = "limit=500" },
  @{ q = "?page=9999&limit=10"; name = "page=big" }
)
$headers = @{ Authorization = "Bearer $token" }
foreach ($t in $tests) {
  Write-Host "`n--- TEST: $($t.name) ---"
  try {
    $url = $base + $t.q
    $r = Invoke-RestMethod -Uri $url -Method Get -Headers $headers -TimeoutSec 10
    $json = $r | ConvertTo-Json -Depth 6
    Write-Host $json
  } catch {
    Write-Host "Request failed: $($_.Exception.Message)"
    if ($_.Exception.Response) {
      $body = (New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())).ReadToEnd()
      Write-Host "Response body: $body"
    }
  }
}

Write-Host "Done tests."
