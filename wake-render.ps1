# wake-render.ps1 — keeps the Render backend alive by pinging every 10 minutes
# Run: .\wake-render.ps1
# Stop: Ctrl+C

$SERVER = "https://software-sarga-2.onrender.com/api/ping"
$INTERVAL_MIN = 10

Write-Host "🔄 Render Keep-Alive Started" -ForegroundColor Cyan
Write-Host "   Pinging: $SERVER every $INTERVAL_MIN minutes" -ForegroundColor Gray
Write-Host "   Press Ctrl+C to stop`n" -ForegroundColor Gray

function Ping-Server {
    try {
        $response = Invoke-WebRequest -Uri $SERVER -TimeoutSec 20 -UseBasicParsing -ErrorAction Stop
        $time = Get-Date -Format "HH:mm:ss"
        Write-Host "[$time] ✅ Server alive — HTTP $($response.StatusCode)" -ForegroundColor Green
    } catch {
        $time = Get-Date -Format "HH:mm:ss"
        Write-Host "[$time] ❌ Ping failed: $($_.Exception.Message)" -ForegroundColor Red
    }
}

# Immediate first ping
Ping-Server

# Loop every 10 minutes
while ($true) {
    Start-Sleep -Seconds ($INTERVAL_MIN * 60)
    Ping-Server
}
