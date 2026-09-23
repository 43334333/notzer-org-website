$backendDir = "c:\Users\spink\Dropbox\Apps\notzer.org\notzer-org-website\apps-script-backend"
Push-Location $backendDir
try {
    & npx.cmd @google/clasp login --no-localhost
} finally {
    Pop-Location
}
