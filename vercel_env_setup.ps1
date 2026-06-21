$expectedKeys = @(
    "VITE_FIREBASE_API_KEY",
    "VITE_FIREBASE_AUTH_DOMAIN",
    "VITE_FIREBASE_PROJECT_ID",
    "VITE_FIREBASE_STORAGE_BUCKET",
    "VITE_FIREBASE_MESSAGING_SENDER_ID",
    "VITE_FIREBASE_APP_ID",
    "VITE_FIREBASE_MEASUREMENT_ID",
    "VITE_API_URL"
)

$envVars = @{}

function Load-EnvFile($filePath) {
    if (Test-Path $filePath) {
        Write-Host "Loading environment variables from $filePath..."
        Get-Content $filePath | ForEach-Object {
            $line = $_.Trim()
            if ($line -and -not $line.StartsWith("#") -and $line.Contains("=")) {
                $parts = $line -split "=", 2
                $key = $parts[0].Trim()
                $val = $parts[1].Trim().Trim('"').Trim("'")
                if ($expectedKeys -contains $key) {
                    $envVars[$key] = $val
                }
            }
        }
    }
}

# Try loading from local environment files
Load-EnvFile "$PSScriptRoot\.env.local"
Load-EnvFile "$PSScriptRoot\.env"

# Fallback to system environment variables
foreach ($key in $expectedKeys) {
    if (-not $envVars.ContainsKey($key)) {
        if (Test-Path "env:\$key") {
            $envVars[$key] = Get-Content "env:\$key"
        } else {
            Write-Warning "Required environment variable '$key' not found in .env files or system environment."
        }
    }
}

foreach ($kv in $envVars.GetEnumerator()) {
    $name = $kv.Key
    $val = $kv.Value
    [IO.File]::WriteAllText("$PSScriptRoot\env_val.txt", $val)
    Write-Host "Adding $name..."
    C:\Windows\System32\cmd.exe /c "type env_val.txt | npx vercel env add $name production" 2>&1 | Out-Null
    Write-Host "Done: $name"
}

Remove-Item "$PSScriptRoot\env_val.txt" -ErrorAction SilentlyContinue
Write-Host "All env vars set!"
