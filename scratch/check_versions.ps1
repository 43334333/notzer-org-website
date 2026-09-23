$ErrorActionPreference = "Stop"
$InvokeClasp = Join-Path $env:USERPROFILE ".gemini\config\scripts\Invoke-Clasp.ps1"
$claspMasterDir = "c:\Users\spink\Dropbox\Apps\notzer.org\notzer-org-website\apps-script-backend\.clasp-master"

Push-Location $claspMasterDir
try {
    & $InvokeClasp -Profile notzer_org -AutoRefresh versions | Select-Object -Last 10
} finally {
    Pop-Location
}
