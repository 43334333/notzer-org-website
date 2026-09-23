$backendDir = "c:\Users\spink\Dropbox\Apps\notzer.org\notzer-org-website\apps-script-backend"
$claspMasterDir = Join-Path $backendDir ".clasp-master"
Push-Location $claspMasterDir
try {
    Write-Host "Test 1: with --"
    & "$HOME\.gemini\config\scripts\Invoke-Clasp.ps1" -Profile notzer_org -AutoRefresh -- deploy --help

    Write-Host "`nTest 2: with --deploymentId"
    & "$HOME\.gemini\config\scripts\Invoke-Clasp.ps1" -Profile notzer_org -AutoRefresh deploy --help
} finally {
    Pop-Location
}
