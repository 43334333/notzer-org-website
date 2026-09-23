Push-Location "c:\Users\spink\Dropbox\Apps\notzer.org\notzer-org-website\apps-script-backend"
try {
    & "$HOME\.gemini\config\scripts\Invoke-Clasp.ps1" -Profile notzer_org -AutoRefresh versions
} finally {
    Pop-Location
}
