$ic = "$env:USERPROFILE\.gemini\config\scripts\Invoke-Clasp.ps1"
$dir = "c:\Users\spink\Dropbox\Apps\notzer.org\notzer-org-website\apps-script-backend\.clasp-master"

Push-Location $dir
try {
    & $ic -Profile notzer_org -AutoRefresh deployments
} finally {
    Pop-Location
}
