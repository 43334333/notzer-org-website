Copy-Item -Path "$HOME\.clasprc.json" -Destination "$HOME\.gemini\config\clasp-profiles\notzer_org.clasprc.json" -Force
Write-Host "Copied .clasprc.json to notzer_org.clasprc.json"
& "$HOME\.gemini\config\scripts\Invoke-Clasp.ps1" -Profile notzer_org -AutoRefresh status
