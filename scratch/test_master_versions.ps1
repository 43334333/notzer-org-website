$backendDir = "c:\Users\spink\Dropbox\Apps\notzer.org\notzer-org-website\apps-script-backend"
$claspMasterDir = Join-Path $backendDir ".clasp-master"
Push-Location $claspMasterDir
try {
    & "$HOME\.gemini\config\scripts\Invoke-Clasp.ps1" -Profile notzer_org -AutoRefresh versions
} finally {
    Pop-Location
}
