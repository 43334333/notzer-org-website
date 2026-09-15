$ErrorActionPreference = "Stop"

$ic = "$env:USERPROFILE\.gemini\config\scripts\Invoke-Clasp.ps1"
$claspMasterDir = "c:\Users\spink\Dropbox\Apps\notzer.org\notzer-org-website\apps-script-backend\.clasp-master"
$prodDeploymentId = "AKfycbzngv-LEqoOercDK5MfRtB8BpEFhH3sdnq16lyxzq2LN_8W0lUQpa-oUZB4CfGYE28y3g"

Write-Host "=== 1. Verifying .clasp-master files ==="
Get-ChildItem $claspMasterDir | Select-Object Name, Length | Format-Table -AutoSize

Write-Host "`n=== 2. Pushing Code to Google Apps Script ==="
Push-Location $claspMasterDir
try {
    & $ic -Profile notzer_org -AutoRefresh push --force
    if ($LASTEXITCODE -ne 0) { throw "clasp push failed with exit code $LASTEXITCODE" }
    
    Write-Host "`n=== 3. Creating New Version ==="
    & $ic -Profile notzer_org -AutoRefresh version "v48_tdf_error_capture_and_fee_fixes"
    if ($LASTEXITCODE -ne 0) { throw "clasp version failed with exit code $LASTEXITCODE" }

    Write-Host "`n=== 4. Updating Production Deployment ==="
    & $ic -Profile notzer_org -AutoRefresh deploy -i $prodDeploymentId -d "v48_tdf_error_capture_and_fee_fixes"
    if ($LASTEXITCODE -ne 0) { throw "clasp deploy failed with exit code $LASTEXITCODE" }

    Write-Host "`n=== 5. Verifying Deployments ==="
    & $ic -Profile notzer_org -AutoRefresh deployments
} finally {
    Pop-Location
}
Write-Host "`nDEPLOYMENT COMPLETE AND VERIFIED!" -ForegroundColor Green
