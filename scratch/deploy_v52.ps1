$ErrorActionPreference = "Stop"

$repoRoot = "c:\Users\spink\Dropbox\Apps\notzer.org\notzer-org-website"
$backendDir = Join-Path $repoRoot "apps-script-backend"
$claspMasterDir = Join-Path $backendDir ".clasp-master"
$ic = "$env:USERPROFILE\.gemini\config\scripts\Invoke-Clasp.ps1"
$prodDeploymentId = "AKfycbzngv-LEqoOercDK5MfRtB8BpEFhH3sdnq16lyxzq2LN_8W0lUQpa-oUZB4CfGYE28y3g"

Write-Host "=== 1. Deploying Site to GitHub Pages ===" -ForegroundColor Cyan
Push-Location $repoRoot
try {
    & pwsh -File .\deploy-site.ps1 "fix(tdf): support upstream grantStatus in getGrantDetails reconciliation"
    if ($LASTEXITCODE -ne 0) { throw "deploy-site.ps1 failed with exit code $LASTEXITCODE" }
} finally {
    Pop-Location
}

Write-Host "`n=== 2. Pushing Code to Google Apps Script ===" -ForegroundColor Cyan
Push-Location $claspMasterDir
try {
    & $ic -Profile notzer_org -AutoRefresh push --force
    if ($LASTEXITCODE -ne 0) { throw "clasp push failed with exit code $LASTEXITCODE" }

    Write-Host "`n=== 3. Creating Version 52 ===" -ForegroundColor Cyan
    & $ic -Profile notzer_org -AutoRefresh version "v52_grant_status_reconciliation_support"
    if ($LASTEXITCODE -ne 0) { throw "clasp version failed with exit code $LASTEXITCODE" }

    Write-Host "`n=== 4. Updating Production Deployment to Version 52 ===" -ForegroundColor Cyan
    & $ic -Profile notzer_org -AutoRefresh -- deploy -i $prodDeploymentId -V 52 -d "v52_grant_status_reconciliation_support"
    if ($LASTEXITCODE -ne 0) { throw "clasp deploy failed with exit code $LASTEXITCODE" }

    Write-Host "`n=== 5. Verifying Deployments ===" -ForegroundColor Cyan
    & $ic -Profile notzer_org -AutoRefresh -- deployments
} finally {
    Pop-Location
}

Write-Host "`n=== V52 DEPLOYMENT SUCCESSFUL ===" -ForegroundColor Green
