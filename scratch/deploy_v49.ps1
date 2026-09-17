$ErrorActionPreference = "Stop"

$ic = "$env:USERPROFILE\.gemini\config\scripts\Invoke-Clasp.ps1"
$backendDir = "c:\Users\spink\Dropbox\Apps\notzer.org\notzer-org-website\apps-script-backend"
$claspMasterDir = Join-Path $backendDir ".clasp-master"
$prodDeploymentId = "AKfycbzngv-LEqoOercDK5MfRtB8BpEFhH3sdnq16lyxzq2LN_8W0lUQpa-oUZB4CfGYE28y3g"

Push-Location $claspMasterDir
try {
    Write-Host "Updating production deployment $prodDeploymentId to Version 49..."
    & $ic -Profile notzer_org -AutoRefresh -- deploy -i $prodDeploymentId -V 49 -d "v49_tdf_v12_contract_alignment_and_pin_validation"
    if ($LASTEXITCODE -ne 0) { throw "clasp deploy failed with exit code $LASTEXITCODE" }

    Write-Host "`nVerifying live deployments..."
    & $ic -Profile notzer_org -AutoRefresh -- deployments
} finally {
    Pop-Location
}
Write-Host "`nDEPLOYMENT COMPLETE AND VERIFIED!" -ForegroundColor Green
