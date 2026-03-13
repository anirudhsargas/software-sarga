# Sarga Deploy Script — run this anytime to push latest code to Vercel
Set-Location "d:\software sarga\client"

Write-Host "Building..." -ForegroundColor Cyan
npm run build 2>&1 | Select-Object -Last 5

Write-Host "Preparing output..." -ForegroundColor Cyan
New-Item -ItemType Directory -Force ".vercel\output\static" | Out-Null
Copy-Item -Path "dist\*" -Destination ".vercel\output\static\" -Recurse -Force
Set-Content ".vercel\output\config.json" '{"version":3,"routes":[{"handle":"filesystem"},{"src":"/(.*)","dest":"/index.html"}]}'

Write-Host "Patching rootDirectory..." -ForegroundColor Cyan
$auth = Get-Content "$env:APPDATA\com.vercel.cli\Data\auth.json" | ConvertFrom-Json
$token = $auth.token
$headers = @{"Authorization"="Bearer $token"; "Content-Type"="application/json"}
$base = "https://api.vercel.com/v9/projects/prj_OnusMBjOqlSdXs7LOcOlpeqc6Vzv?teamId=team_Up32BssEnS1BBEyRFLimVlW0"
Invoke-RestMethod -Uri $base -Method Patch -Headers $headers -Body '{"rootDirectory":null}' | Out-Null

Write-Host "Deploying to Vercel..." -ForegroundColor Cyan
vercel deploy --prebuilt --prod --yes 2>&1

Write-Host "Restoring rootDirectory..." -ForegroundColor Cyan
Invoke-RestMethod -Uri $base -Method Patch -Headers $headers -Body '{"rootDirectory":"client"}' | Out-Null

Write-Host "Done! https://software-sarga.vercel.app is updated." -ForegroundColor Green
