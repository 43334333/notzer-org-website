$ErrorActionPreference = "Stop"

$repoRoot = "c:\Users\spink\Dropbox\Apps\notzer.org\notzer-org-website"
$backendDir = Join-Path $repoRoot "apps-script-backend"
$claspMasterDir = Join-Path $backendDir ".clasp-master"
$ic = "$env:USERPROFILE\.gemini\config\scripts\Invoke-Clasp.ps1"
$prodDeploymentId = "AKfycbzngv-LEqoOercDK5MfRtB8BpEFhH3sdnq16lyxzq2LN_8W0lUQpa-oUZB4CfGYE28y3g"

Write-Host "=== 1. Deploying Site to GitHub Pages ===" -ForegroundColor Cyan
Push-Location $repoRoot
try {
    & pwsh -File .\deploy-site.ps1 "fix(tdf): sanitize requestId against PAN/PIN injection and enforce zero-secret persistence"
    if ($LASTEXITCODE -ne 0) { throw "deploy-site.ps1 failed with exit code $LASTEXITCODE" }
} finally {
    Pop-Location
}

Write-Host "`n=== 2. Pushing Code to Google Apps Script ===" -ForegroundColor Cyan
Push-Location $claspMasterDir
try {
    & $ic -Profile notzer_org -AutoRefresh push --force
    if ($LASTEXITCODE -ne 0) { throw "clasp push failed with exit code $LASTEXITCODE" }

    Write-Host "`n=== 3. Creating Version 51 ===" -ForegroundColor Cyan
    & $ic -Profile notzer_org -AutoRefresh version "v51_request_id_pan_pin_sanitization_zero_secret_guarantee"
    if ($LASTEXITCODE -ne 0) { throw "clasp version failed with exit code $LASTEXITCODE" }

    Write-Host "`n=== 4. Updating Production Deployment to Version 51 ===" -ForegroundColor Cyan
    & $ic -Profile notzer_org -AutoRefresh -- deploy -i $prodDeploymentId -V 51 -d "v51_request_id_pan_pin_sanitization_zero_secret_guarantee"
    if ($LASTEXITCODE -ne 0) { throw "clasp deploy failed with exit code $LASTEXITCODE" }

    Write-Host "`n=== 5. Verifying Deployments ===" -ForegroundColor Cyan
    & $ic -Profile notzer_org -AutoRefresh -- deployments
} finally {
    Pop-Location
}

Write-Host "`n=== V51 DEPLOYMENT SUCCESSFUL ===" -ForegroundColor Green
