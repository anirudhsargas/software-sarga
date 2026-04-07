# Sarga - Start all servers (accessible on local network)
Write-Host ""
Write-Host "Starting Sarga servers..." -ForegroundColor Cyan

# Get local IP
$ip = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.PrefixOrigin -eq "Dhcp" -or ($_.PrefixOrigin -eq "Manual" -and $_.IPAddress -notlike "169.*" -and $_.IPAddress -ne "127.0.0.1") } | Select-Object -First 1).IPAddress
if (-not $ip) { $ip = "YOUR_IP" }

# Start backend
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd 'D:\software sarga\server'; node index.js" -WindowStyle Normal

Start-Sleep -Seconds 2

# Start frontend
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd 'D:\software sarga\client'; npm run dev" -WindowStyle Normal

Start-Sleep -Seconds 3

Write-Host ""
Write-Host "==========================================" -ForegroundColor Green
Write-Host "  App is running!" -ForegroundColor Green
Write-Host "  Local:   http://localhost:5173" -ForegroundColor White
Write-Host "  Network: http://${ip}:5173" -ForegroundColor Yellow
Write-Host "==========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Share this link with devices on the same WiFi:" -ForegroundColor Cyan
Write-Host "  http://${ip}:5173" -ForegroundColor Yellow
Write-Host ""
