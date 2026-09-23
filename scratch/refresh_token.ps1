$wrapper = Join-Path $env:USERPROFILE '.gemini\config\scripts\Invoke-Clasp.ps1'
& $wrapper -Profile notzer_org -AutoRefresh version
