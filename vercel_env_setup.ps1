$envVars = @{
    "VITE_FIREBASE_API_KEY" = "AIzaSyAqsXy2h5rG0FQ0Cvreu1AIHC_-NRPxrpg"
    "VITE_FIREBASE_AUTH_DOMAIN" = "sarga-prints.firebaseapp.com"
    "VITE_FIREBASE_PROJECT_ID" = "sarga-prints"
    "VITE_FIREBASE_STORAGE_BUCKET" = "sarga-prints.firebasestorage.app"
    "VITE_FIREBASE_MESSAGING_SENDER_ID" = "1033339625034"
    "VITE_FIREBASE_APP_ID" = "1:1033339625034:web:cbb9d1065edbcb7ef490b3"
    "VITE_FIREBASE_MEASUREMENT_ID" = "G-5XD6YCERCC"
    "VITE_API_URL" = "https://software-sarga-2.onrender.com/api"
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
